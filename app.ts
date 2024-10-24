// deno-lint-ignore-file ban-unused-ignore no-explicit-any no-deprecated-deno-api

import 'jsr:@std/dotenv/load';
import { exists } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import * as crypto from 'node:crypto';
import { JSONFile } from 'npm:lowdb/node';
import { v7 as uuidv7 } from 'npm:uuid';

import { Low } from 'npm:lowdb';
import lodash from 'npm:lodash';
import {
    ConnectionTypes,
    Connection,
    CreateDroplet,
    DatabaseData,
    StrictHostKeyChecking,
} from './src/types.ts';

import {
    ENV,
    APP_ID,
    LOOP_INTERVAL_MIN,
    LOOP_TIMEOUT_MIN,
    TUNNEL_CONNECT_TIMEOUT_SEC,
    LOCAL_TEST_PORT,
    LOCAL_PORT,
    REMOTE_PORT,
    KEY_ALGORITHM,
    KEY_LENGTH,
    DIGITAL_OCEAN_API_KEY,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_KEY,
    CLOUDFLARE_KV_NAMESPACE,
    DROPLET_SIZE,
    DROPLET_REGIONS,
    TEST_PROXY_URL,
    DIGITAL_OCEAN_BASE_URL,
    CLOUDFLARE_BASE_URL,
    __DIRNAME,
    DATA_PATH,
    KEY_PATH,
    SRC_PATH,
    LOG_PATH,
    KNOWN_HOSTS_PATH,
    DB_FILE_NAME,
    SSH_LOG_OUTPUT_EXTENSION,
    GENERATE_SSH_KEY_FILE_NAME,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    USER,
    CONNECTION_TYPES,
} from './src/constants.ts';

const defaultData: DatabaseData = {
    connections: [],
};

let secondsLeftForLoopRetrigger = 0;
let timeout = 0;

class LowWithLodash<T> extends Low<T> {
    chain: lodash.ExpChain<this['data']> = lodash.chain(this).get('data');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const getDatabase = async (): Promise<LowWithLodash<DatabaseData>> => {
    const adapter = new JSONFile<DatabaseData>(DB_FILE_NAME);
    const db = new LowWithLodash(adapter, defaultData);
    await db.read();
    db.data ||= { connections: [] };
    db.chain = lodash.chain(db.data);
    return db;
};

const db: LowWithLodash<DatabaseData> = await getDatabase();

const ensurePath = async (path: string) => {
    if (!await exists(path)) {
        await Deno.mkdir(path);
    }
};

const getUserData = () => {
    return `
#cloud-config
runcmd:
    - sudo apt install tinyproxy -y
    - echo 'Port ${REMOTE_PORT}' > nano tinyproxy.conf
    - echo 'Listen 0.0.0.0' > nano tinyproxy.conf
    - echo 'Timeout 600' > nano tinyproxy.conf
    - echo 'Allow 0.0.0.0' > nano tinyproxy.conf
    - tinyproxy -d -c tinyproxy.conf

    - DROPLET_ID=$(echo \`curl http://169.254.169.254/metadata/v1/id\`)
    - HOST_KEY=$(cat /etc/ssh/ssh_host_${KEY_ALGORITHM}_key.pub | cut -d ' ' -f 2)
    - curl --request PUT -H 'Content-Type=*\/*' --data $HOST_KEY --url ${CLOUDFLARE_BASE_URL}/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/values/$DROPLET_ID --oauth2-bearer ${CLOUDFLARE_API_KEY}
`;
};

const getHostKey = async (dropletId: number, proxyUrl = '') => {
    let hostKey: string = '';

    while (!hostKey) {
        try {
            const headers = {
                Authorization: `Bearer ${CLOUDFLARE_API_KEY}`,
            };
            const options: any = { method: 'GET', headers };
            if (proxyUrl) {
                options.client = Deno.createHttpClient({
                    proxy: {
                        url: proxyUrl,
                    },
                });
            }
            const url =
                `${CLOUDFLARE_BASE_URL}/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/values/${dropletId}`;
            const res = await fetch(url, options);
            const text = await res.text();

            if (!text.includes('key not found')) {
                hostKey = text;
            }
        } catch (_) {
            await sleep(1000);
        }
    }

    return hostKey;
};

const apiTest = async (proxyUrl = '') => {
    let response = null;

    while (!response) {
        try {
            response = await listRegions(proxyUrl);
        } catch (_) {
            await sleep(1000);
        }
    }
};

const listRegions = async (proxyUrl = '') => {
    const headers = {
        Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
    };
    const options: any = { method: 'GET', headers };

    if (proxyUrl) {
        options.client = Deno.createHttpClient({
            proxy: {
                url: proxyUrl,
            },
        });
    }
    const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/regions`, options);
    const json: any = await res.json();
    return json.regions;
};

const listDroplets = async () => {
    const headers = {
        Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
    };
    const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/droplets`, { method: 'GET', headers });
    const json: any = await res.json();
    return json;
};

const listKeys = async () => {
    const headers = {
        Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
    };
    const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/account/keys`, {
        method: 'GET',
        headers,
    });
    const json: any = await res.json();
    return json;
};

const createDroplet = async (args: CreateDroplet) => {
    const { region, name, size, publicKeyId, userData } = args;
    const headers = {
        Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
        'Content-Type': 'application/json',
    };
    const body = {
        name,
        region,
        size,
        image: 'debian-12-x64',
        ssh_keys: [publicKeyId],
        user_data: userData,
    };
    const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/droplets`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const json: any = await res.json();
    return json.droplet.id;
};

const deleteDroplets = async (ids: number[]) => {
    let index = 0;

    while (index < ids.length) {
        const id = ids[index];
        const headers = {
            Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
            'Content-Type': 'application/json',
        };
        await fetch(`${DIGITAL_OCEAN_BASE_URL}/droplets/${id}`, {
            method: 'DELETE',
            headers,
        });
        console.log(`Deleted droplet: ${id}.`);
        index = index + 1;
    }
};

const deleteKeys = async (ids: number[]) => {
    let index = 0;

    while (index < ids.length) {
        const id = ids[index];
        const headers = {
            Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
            'Content-Type': 'application/json',
        };
        await fetch(`${DIGITAL_OCEAN_BASE_URL}/account/keys/${id}`, {
            method: 'DELETE',
            headers,
        });
        console.log(`Deleted key: ${id}.`);
        index = index + 1;
    }
};

const addKey = async (publicKey: string, name: string) => {
    const headers = {
        Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
        'Content-Type': 'application/json',
    };
    const body = {
        name: name,
        'public_key': publicKey,
    };
    const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/account/keys`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const json: any = await res.json();
    return json['ssh_key']['id'];
};

const tunnel = async (
    connection: Connection,
    port: number,
    strictHostKeyChecking: string,
) => {
    const connectionString = connection.connectionString
        .replace(` ${LOCAL_PORT} `, ` ${port} `)
        .replace(StrictHostKeyChecking.Yes, strictHostKeyChecking)
        .replace('\n', '');
    let isConnected = false;

    while (!isConnected) {
        try {
            await killAllSshTunnelsByPort(port);
            await sleep(1000);

            // @ts-ignore: because
            const openSshProxyTunnelTestProcess = Deno.run({
                cmd: connectionString.split(' '),
                stdout: 'piped',
                stderr: 'piped',
                stdin: 'null',
            });
            await sleep(TUNNEL_CONNECT_TIMEOUT_SEC * 1000);
            await openSshProxyTunnelTestProcess.stderrOutput();
            const sshLogOutput = await Deno.readTextFile(connection.sshLogOutputPath);
            isConnected = sshLogOutput.includes('pledge: network');
        }
        catch(_) {
            _;
        }
    }
};

const killAllSshTunnelsByPort = async (port: number) => {
    const cmd = 'pkill';
    const args = `-f ${port}:`.split(' ');
    const command = new Deno.Command(cmd, { args });
    await command.output();
};

const updateHostKeys = async (
    dropletId: number,
    dropletIp: string,
    proxyUrl = '',
) => {
    const knownHosts = await Deno.readTextFile(KNOWN_HOSTS_PATH);
    const isAlreadySaved = knownHosts.includes(dropletIp);

    if (!isAlreadySaved) {
        const hostKey = await getHostKey(dropletId, proxyUrl);
        console.log(`Fetched host key for droplet ${dropletId}.`);

        Deno.writeTextFileSync(
            KNOWN_HOSTS_PATH,
            `${dropletIp} ssh-${KEY_ALGORITHM} ${hostKey}\n`,
            { append: true },
        );
        console.log(`Added host key for ${dropletIp} to known hosts.`);
    }
};

const retrySleep = async () => {
    const sleepingTimeSeconds = secondsLeftForLoopRetrigger;
    if (sleepingTimeSeconds > 0) {
        console.log(
            `Waiting for ${sleepingTimeSeconds} seconds to start again.`,
        );
        await sleep(sleepingTimeSeconds * 1000);
    }
};

const getDropletIp = async (dropletId: string) => {
    let dropletIp = null;

    while (!dropletIp) {
        const list = await listDroplets();
        const droplets = list.droplets;

        if (list && droplets) {
            const droplet = droplets.find((droplet: any) =>
                droplet.id == dropletId
            );

            if (droplet && droplet.networks.v4.length) {
                dropletIp = droplet.networks.v4.filter((network: any) =>
                    network.type == 'public'
                )[0]['ip_address'];
            }
        }
    }

    console.log(`Found network at ${dropletIp}.`);

    return dropletIp;
};

const createKey = async (
    keyPath: string,
    dropletName: string,
    passphrase: string,
) => {
    const cmd =
        `${SRC_PATH}/${GENERATE_SSH_KEY_FILE_NAME} ${passphrase} ${keyPath} ${KEY_ALGORITHM} ${KEY_LENGTH}`;
    // @ts-ignore: because
    const createSshKeyProcess = Deno.run({ cmd: cmd.split(' ') });
    await createSshKeyProcess.status();

    const publicKey = await Deno.readTextFile(`${keyPath}.pub`);
    const publicKeyId = await addKey(publicKey, dropletName);
    return publicKeyId;
};

const getConnectionString = (
    connection: Connection,
    strictHostKeyChecking: string,
): string => {
    const {
        passphrase,
        dropletIp,
        keyPath,
        sshLogOutputPath
    } = connection;
    return `${SRC_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME} ${passphrase} ${dropletIp} ${USER} ${LOCAL_PORT} ${REMOTE_PORT} ${keyPath} ${strictHostKeyChecking} ${sshLogOutputPath}`;
};

const getSshLogOutputPath = (connectionId: string): string =>`${LOG_PATH}/${connectionId}${SSH_LOG_OUTPUT_EXTENSION}`;

const init = async () => {
    const connection = db
        .chain
        .get('connections')
        .filter((connection: Connection) => !connection.isDeleted)
        .sortBy('createdTime')
        .reverse()
        .value()[0];

    connection && await connect(connection, StrictHostKeyChecking.No);
    return connection;
};

const connect = async (
    connection: Connection,
    strictHostKeyChecking: string,
) => {
    const { dropletId, dropletIp } = connection;

    console.log(`Starting SSH test tunnel connection to ${dropletIp}.`);

    await tunnel(
        connection,
        LOCAL_TEST_PORT,
        strictHostKeyChecking,
    );
    console.log(`Connected SSH test tunnel to ${dropletIp}.`);

    console.log('Starting DigitalOcean API test (1).');
    await apiTest(TEST_PROXY_URL);
    console.log('Successfully finished DigitalOcean API test (1).');

    await updateHostKeys(dropletId, dropletIp, TEST_PROXY_URL);

    await killAllSshTunnelsByPort(LOCAL_TEST_PORT);
    await sleep(1000);

    console.log(`Starting SSH tunnel connection to ${dropletIp}.`);
    await tunnel(connection, LOCAL_PORT, strictHostKeyChecking);
    console.log(`Connected SSH tunnel to ${dropletIp}.`);

    console.log('Starting DigitalOcean API test (2).');
    await apiTest();
    console.log('Successfully finished DigitalOcean API test (2).');
};

const cleanup = async (dropletIdsToKeep: number[]) => {
    const deletableKeyIds = (await listKeys())['ssh_keys']
        .filter((key: any) => key.name.includes(`${APP_ID}-${ENV}`))
        .map((key: any) => key.id);
    await deleteKeys(deletableKeyIds);

    const deletableDropletIds = (await listDroplets()).droplets
        .filter((droplet: any) => droplet.name.includes(`${APP_ID}-${ENV}`))
        .map((droplet: any) => droplet.id)
        .filter((id: number) => !dropletIdsToKeep.includes(id));
    await deleteDroplets(deletableDropletIds);
};

const loop = () => {
    clearTimeout(timeout);

    timeout = setTimeout(async () => {
        try {
            const startTime = performance.now();
            secondsLeftForLoopRetrigger = LOOP_INTERVAL_MIN * 60;
            await rotate();
            const endTime = performance.now();
            console.log(
                `Proxy loop finished in ${
                    Number((endTime - startTime) / 1000).toFixed(0)
                } seconds.`,
            );
        } catch (err) {
            console.log(`Proxy loop caught an error.`, err);
        }

        await retrySleep();
        loop();
    });
};

setInterval(() => {
    secondsLeftForLoopRetrigger = secondsLeftForLoopRetrigger - 1;
    const secondsLeftForLoopTimeout = LOOP_TIMEOUT_MIN * 60 +
        secondsLeftForLoopRetrigger;

    if (secondsLeftForLoopTimeout < 0) {
        console.log(
            `Reached timeout interval of ${LOOP_TIMEOUT_MIN} minutes, restarting the loop.`,
        );
        loop();
    }
}, 1000);

const rotate = async () => {
    const activeConnections: Connection[] = [];
    const initConnection = await init();
    initConnection && activeConnections.push(initConnection);
    const connectionTypes: ConnectionTypes[] = initConnection
        ? [ConnectionTypes.A]
        : CONNECTION_TYPES;
    let connectionIndex = 0;

    while (connectionIndex < connectionTypes.length) {
        const connectionId = uuidv7();
        const connectionType = connectionTypes[connectionIndex];
        const dropletRegion = (await listRegions())
            .filter((region: any) =>
                DROPLET_REGIONS.length
                    ? DROPLET_REGIONS.includes(region.slug)
                    : true
            )
            .filter((region: any) => region.sizes.includes(DROPLET_SIZE))
            .map((region: any) => region.slug)
            .sort(() => (Math.random() > 0.5) ? 1 : -1)[0];
        const dropletName = `${APP_ID}-${ENV}-${connectionType}-${connectionId}`;

        const keyPath = `${KEY_PATH}/${dropletName}`;
        const passphrase = crypto.randomBytes(64).toString('hex');
        const publicKeyId = await createKey(keyPath, dropletName, passphrase);

        const dropletId = await createDroplet({
            region: dropletRegion,
            name: dropletName,
            size: DROPLET_SIZE,
            publicKeyId,
            userData: getUserData(),
        });
        console.log('Created droplet.', {
            dropletName,
            dropletRegion,
            dropletSize: DROPLET_SIZE,
            dropletId,
            dropletPublicKeyId: publicKeyId,
        });

        const dropletIp = await getDropletIp(dropletId);

        const connection: Connection = {
            connectionId,
            appId: APP_ID,
            dropletId,
            dropletName,
            dropletIp,
            dropletRegion,
            dropletSize: DROPLET_SIZE,
            dropletPublicKeyId: publicKeyId,
            connectionType,
            user: USER,
            passphrase,
            loopIntervalMin: LOOP_INTERVAL_MIN,
            loopTimeoutMin: LOOP_TIMEOUT_MIN,
            keyAlgorithm: KEY_ALGORITHM,
            localTestPort: LOCAL_TEST_PORT,
            localPort: LOCAL_PORT,
            remotePort: REMOTE_PORT,
            keyPath,
            sshLogOutputPath: getSshLogOutputPath(connectionId),
            connectionString: '',
            isDeleted: false,
            createdTime: new Date().toISOString(),
            modifiedTime: null,
            deletedTime: null,
        };
        connection.connectionString = getConnectionString(connection, StrictHostKeyChecking.Yes);

        db.data.connections.push(connection);
        db.write();

        await updateHostKeys(dropletId, dropletIp);

        activeConnections.push(connection);
        connectionIndex = connectionIndex + 1;
    }

    if (!initConnection) {
        await connect(activeConnections[0], StrictHostKeyChecking.Yes);
    }

    await cleanup(
        activeConnections.map(connection => connection.dropletId)
    );
};

await ensurePath(DATA_PATH);
await ensurePath(KEY_PATH);
await ensurePath(LOG_PATH);

loop();

// deno-lint-ignore-file ban-unused-ignore no-explicit-any no-deprecated-deno-api

import 'jsr:@std/dotenv/load';
import * as path from 'https://deno.land/std@0.224.0/path/mod.ts';
import { exists } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import * as crypto from 'node:crypto';
// @deno-types='npm:@types/node'
import { homedir } from 'node:os';
import { JSONFile } from 'npm:lowdb/node';
import { v7 as uuidv7 } from 'npm:uuid';

import { Low } from 'npm:lowdb';
import lodash from 'npm:lodash';
import {
    ConnectionTypes,
    ConnectionString,
    Connect,
    Connection,
    CreateDroplet,
    DatabaseData,
    STRICT_HOST_KEY_CHECKING,
} from './types.ts';

const ENV = String(Deno.env.get('ENV'));
const APP_ID = String(Deno.env.get('APP_ID'));
const LOOP_INTERVAL_MIN = Number(Deno.env.get('LOOP_INTERVAL_MIN'));
const LOOP_TIMEOUT_MIN = Number(Deno.env.get('LOOP_TIMEOUT_MIN'));
const LOCAL_TEST_PORT = Number(Deno.env.get('LOCAL_TEST_PORT'));
const LOCAL_PORT = Number(Deno.env.get('LOCAL_PORT'));
const REMOTE_PORT = Number(Deno.env.get('REMOTE_PORT'));
const KEY_ALGORITHM = String(Deno.env.get('KEY_ALGORITHM'));
const DIGITAL_OCEAN_API_KEY = String(Deno.env.get('DIGITAL_OCEAN_API_KEY'));
const CLOUDFLARE_ACCOUNT_ID = String(Deno.env.get('CLOUDFLARE_ACCOUNT_ID'));
const CLOUDFLARE_API_KEY = String(Deno.env.get('CLOUDFLARE_API_KEY'));
const CLOUDFLARE_KV_NAMESPACE = String(Deno.env.get('CLOUDFLARE_KV_NAMESPACE'));
const DROPLET_SIZE = String(Deno.env.get('DROPLET_SIZE'));
const DROPLET_REGIONS = String(Deno.env.get('DROPLET_REGIONS'))
    .split(',')
    .filter(region => region.length)
const TEST_PROXY_URL = `http://localhost:${LOCAL_TEST_PORT}`;
const DIGITAL_OCEAN_BASE_URL = 'https://api.digitalocean.com/v2';
const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4';
const __DIRNAME = path.dirname(path.fromFileUrl(import.meta.url));
const HOME_PATH = homedir();
const DATA_PATH = `${HOME_PATH}/.${APP_ID}`;
const KEY_PATH = `${DATA_PATH}/.keys`;
const SRC_PATH = `${__DIRNAME}/src`;
const KNOWN_HOSTS_PATH = `${HOME_PATH}/.ssh/known_hosts`;
const DB_FILE_NAME = `${DATA_PATH}/.database.${ENV}.json`;
const GENERATE_SSH_KEY_FILE_NAME = 'generate-ssh-key.exp';
const CONNECT_SSH_TUNNEL_FILE_NAME = 'connect-ssh-tunnel.exp';
const USER = 'root';
const CONNECTION_TYPES: ConnectionTypes[] = [ConnectionTypes.B, ConnectionTypes.A];

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

    - echo 'PasswordAuthentication no' > sudo nano /etc/ssh/sshd_config

    - DROPLET_ID=$(echo \`curl http://169.254.169.254/metadata/v1/id\`)
    - HOST_KEY=$(cat /etc/ssh/ssh_host_${KEY_ALGORITHM}_key.pub | cut -d ' ' -f 2)
    - curl --request PUT -H 'Content-Type=*\/*' --data $HOST_KEY --url ${CLOUDFLARE_BASE_URL}/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/values/$DROPLET_ID --oauth2-bearer ${CLOUDFLARE_API_KEY}
`;
};

const getHostKey = async (dropletId: number, proxyUrl = '') => {
    let hostKey: any = '';

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
    let canGet = false;

    while (!canGet) {
        try {
            canGet = await listRegions(proxyUrl);
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

const connectSshProxyTunnel = async (cmd: string) => {
    let isConnectable = false;
    while (!isConnectable) {
        // @ts-ignore: because
        const openSshProxyTunnelTestProcess = Deno.run({
            cmd: cmd.split(' '),
            stdout: 'piped',
            stderr: 'piped',
            stdin: 'null',
        });
        const output = new TextDecoder().decode(
            await openSshProxyTunnelTestProcess.stderrOutput(),
        );
        isConnectable = !output;
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
    const createSshKeyCmd =
        `${SRC_PATH}/${GENERATE_SSH_KEY_FILE_NAME} ${passphrase} ${keyPath} ${KEY_ALGORITHM}`;
    // @ts-ignore: because
    const createSshKeyProcess = Deno.run({ cmd: createSshKeyCmd.split(' ') });
    await createSshKeyProcess.status();

    const publicKey = await Deno.readTextFile(`${keyPath}.pub`);
    const publicKeyId = await addKey(publicKey, dropletName);
    return publicKeyId;
};

const getConnectionString = (args: ConnectionString): string => {
    const {
        passphrase,
        dropletIp,
        keyPath,
        strictHostKeyChecking
    } = args;
    return `${SRC_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME} ${passphrase} ${dropletIp} ${USER} ${LOCAL_PORT} ${REMOTE_PORT} ${keyPath} ${strictHostKeyChecking}`;
};

const connect = async (args: Connect) => {
    const { dropletId, dropletIp, connectionType, strictHostKeyChecking } = args;

    await killAllSshTunnelsByPort(LOCAL_TEST_PORT);
    await sleep(1000);

    console.log(`Starting SSH test tunnel connection to (${connectionType}).`);

    const connectionString = args.connectionString.replace('\n', '');
    await connectSshProxyTunnel(
        connectionString
            .replace(`${LOCAL_PORT}`, `${LOCAL_TEST_PORT}`)
            .replace(STRICT_HOST_KEY_CHECKING.YES, strictHostKeyChecking),
    );
    console.log(`Connected SSH test tunnel to (${connectionType}).`);

    console.log('Starting API test (1).');
    await apiTest(TEST_PROXY_URL);
    console.log('Successfully finished API test (1).');

    await updateHostKeys(dropletId, dropletIp, TEST_PROXY_URL);

    await killAllSshTunnelsByPort(LOCAL_TEST_PORT);
    await killAllSshTunnelsByPort(LOCAL_PORT);
    await sleep(1000);

    console.log(`Starting SSH tunnel connection to (${connectionType}).`);
    await connectSshProxyTunnel(connectionString);
    console.log(`Connected SSH tunnel to (${connectionType}).`);

    console.log('Starting API test (2).');
    await apiTest();
    console.log('Successfully finished API test (2).');
};

const cleanup = async (previousDroplets: any[]) => {
    const keys = await listKeys();
    const deletableKeyIds = keys['ssh_keys']
        .filter((key: any) => key.name.includes(`${APP_ID}-${ENV}`))
        .map((key: any) => key.id);
    await deleteKeys(deletableKeyIds);
    const deletableDropletIds = previousDroplets
        .filter((key: any) => key.name.includes(`${APP_ID}-${ENV}`))
        .map((droplet: any) => droplet.id);
    await deleteDroplets(deletableDropletIds);
};

const init = async () => {
    const connection = db
        .chain
        .get('connections')
        .filter((connection: Connection) => connection.connectionType === ConnectionTypes.B)
        .filter((connection: Connection) => !connection.isDeleted)
        .sortBy('createdTime')
        .reverse()
        .value()[0];

    if (connection) {
        const {
            dropletId,
            dropletIp,
            dropletName,
            connectionType,
            passphrase,
            localPort,
            remotePort,
        } = connection;
        const keyPath = `${KEY_PATH}/${dropletName}`;
        const connectionString = getConnectionString({
            passphrase,
            dropletIp,
            localPort,
            remotePort,
            keyPath,
            strictHostKeyChecking: STRICT_HOST_KEY_CHECKING.YES
        });
        await connect({
            connectionString,
            connectionType,
            strictHostKeyChecking: STRICT_HOST_KEY_CHECKING.NO,
            dropletId,
            dropletIp,
        });
    }
};

const rotate = async () => {
    // Store for deleting later on in the process.
    const previousDroplets = await listDroplets();
    const dropletIds: number[] = [];
    const dropletIps: string[] = [];

    let connectionString = '';
    let connectionTypeIndex = 0;

    while (connectionTypeIndex < CONNECTION_TYPES.length) {
        const connectionId = uuidv7();
        const connectionType = CONNECTION_TYPES[connectionTypeIndex];
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
        dropletIds.push(dropletId);
        console.log('Created droplet.', {
            dropletName,
            dropletRegion,
            dropletSize: DROPLET_SIZE,
            dropletId,
        });

        const dropletIp = await getDropletIp(dropletId);
        dropletIps.push(dropletIp);

        connectionString = getConnectionString({
            passphrase,
            dropletIp,
            localPort: LOCAL_PORT,
            remotePort: REMOTE_PORT,
            keyPath,
            strictHostKeyChecking: STRICT_HOST_KEY_CHECKING.YES
        });

        const connection: Connection = {
            connectionId,
            appId: APP_ID,
            dropletId,
            dropletName,
            dropletIp,
            dropletRegion,
            dropletSize: DROPLET_SIZE,
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
            connectionString,
            isDeleted: false,
            createdTime: new Date().toISOString(),
            modifiedTime: null,
            deletedTime: null,
        };
        db.data.connections.push(connection);
        db.write();

        await updateHostKeys(dropletId, dropletIp);

        connectionTypeIndex = connectionTypeIndex + 1;
    }

    await connect({
        connectionString,
        connectionType: ConnectionTypes.A,
        strictHostKeyChecking: STRICT_HOST_KEY_CHECKING.YES,
        dropletId: dropletIds[1],
        dropletIp: dropletIps[1],
    });
    await cleanup(previousDroplets.droplets);
};

await ensurePath(DATA_PATH);
await ensurePath(KEY_PATH);
await init();
loop();

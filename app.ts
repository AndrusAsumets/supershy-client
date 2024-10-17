// deno-lint-ignore-file ban-unused-ignore no-explicit-any no-deprecated-deno-api

import 'jsr:@std/dotenv/load';
import * as path from 'https://deno.land/std@0.224.0/path/mod.ts';
import { exists } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import * as crypto from 'node:crypto';
import { homedir } from 'node:os';


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
const baseUrl = 'https://api.digitalocean.com/v2';
const __dirname = path.dirname(path.fromFileUrl(import.meta.url));
const tmpPath = `${__dirname}/.tmp/`;
const srcPath = `${__dirname}/src/`;
const knownHostsPath = `${homedir()}/.ssh/known_hosts`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const getFiles = async (path: string) => {
    const fileNames: string[] = [];

    for await (const dirEntry of Deno.readDir(path)) {
      if (dirEntry.isFile) {
        fileNames.push(dirEntry.name);
      }
    }

    return fileNames;
};

const createFolderIfNeed = async (path: string) => {
    if (!await exists(path)) {
        await Deno.mkdir(path);
    }
};

const buildUserData = () => {
    return `
#cloud-config
runcmd:
    - sudo apt install tinyproxy -y
    - echo "Port ${REMOTE_PORT}" > nano tinyproxy.conf
    - echo "Listen 0.0.0.0" > nano tinyproxy.conf
    - echo "Timeout 600" > nano tinyproxy.conf
    - echo "Allow 0.0.0.0" > nano tinyproxy.conf
    - tinyproxy -d -c tinyproxy.conf

    - echo "PasswordAuthentication no" > sudo nano /etc/ssh/sshd_config

    - DROPLET_ID=$(echo \`curl http://169.254.169.254/metadata/v1/id\`)
    - HOST_KEY=$(cat /etc/ssh/ssh_host_${KEY_ALGORITHM}_key.pub | cut -d " " -f 2)
    - curl --request PUT -H 'Content-Type=*\/*' --data $HOST_KEY --url https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/values/$DROPLET_ID --oauth2-bearer ${CLOUDFLARE_API_KEY}
`;
};

const getHostKey = async (dropletId: number) => {
    let hostKey: any = '';

    while(!hostKey) {
        try {
            const headers = {
                Authorization: `Bearer ${CLOUDFLARE_API_KEY}`
            };
            const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/values/${dropletId}`, { method: 'GET', headers });
            const text = await res.text();

            if (!text.includes('key not found')) {
                hostKey = text
            }
        }
        catch(_) {
            await sleep(1000);
        }
    }

    return hostKey;
};

const apiTest = async (proxyUrl = '') => {
    let canGet = false;

    while(!canGet) {
        try {
            canGet = await listRegions(proxyUrl);
        }
        catch(_) {
            await sleep(1000);
        }
    }
};

const listRegions = async (proxyUrl = '') => {
    const headers = {
        Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`
    };
    const options: any = { method: 'GET', headers };

    if (proxyUrl) {
        options.client = Deno.createHttpClient({
            proxy: {
              url: proxyUrl
            }
        });
    }
    const res = await fetch(`${baseUrl}/regions`, options);
    const json: any = await res.json();
    return json;
};

const listDroplets = async () => {
    const headers = {
        Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`
    };
    const res = await fetch(`${baseUrl}/droplets`, { method: 'GET', headers });
    const json: any = await res.json();
    return json;
};

const listKeys = async () => {
    const headers = {
        Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`
    };
    const res = await fetch(`${baseUrl}/account/keys`, { method: 'GET', headers });
    const json: any = await res.json();
    return json;
};

const createDroplet = async (region: string, name: string, size: string, publicKey: string, userData: string) => {
    const headers = {
        Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
        'Content-Type': 'application/json'
    };
    const body = {
        name,
        region,
        size,
        image: 'debian-12-x64',
        ssh_keys: [publicKey],
        user_data: userData

    };
    const res = await fetch(`${baseUrl}/droplets`, { method: 'POST', headers, body: JSON.stringify(body) });
    const json: any = await res.json();
    return json;
};

const deleteDroplets = async (ids: number[]) => {
    let index = 0;

    while(index < ids.length) {
        const id = ids[index];
        const headers = {
            Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
            'Content-Type': 'application/json'
        };
        await fetch(`${baseUrl}/droplets/${id}`, { method: 'DELETE', headers });
        console.log(`Deleted droplet: ${id}.`);
        index = index + 1;
    }
};

const deleteKeys = async (ids: number[]) => {
    let index = 0;

    while(index < ids.length) {
        const id = ids[index];
        const headers = {
            Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
            'Content-Type': 'application/json'
        };
        await fetch(`${baseUrl}/account/keys/${id}`, { method: 'DELETE', headers });
        console.log(`Deleted key: ${id}.`);
        index = index + 1;
    }
};

const addKey = async (publicKey: string, name: string) => {
    const headers = {
        Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
        'Content-Type': 'application/json'
    };
    const body = {
        name: name,
        'public_key': publicKey
    };
    const res = await fetch(`${baseUrl}/account/keys`, { method: 'POST', headers, body: JSON.stringify(body) });
    const json: any = await res.json();
    return json['ssh_key']['id'];
};

const connectSshProxyTunnel = async (cmd: string, ) => {
    // @ts-ignore: because
    const connectSshProxyTunnelProcess = Deno.run({
        cmd: cmd.split(' '),
        stdout: 'piped',
        stderr: 'piped',
        stdin: 'null'
    });
    new TextDecoder().decode(await connectSshProxyTunnelProcess.stderrOutput());
};

const killAllSshTunnelsByPort = async (port: number) => {
    const cmd = 'pkill';
    const args =  `-f ${port}:`.split(' ');
    const command = new Deno.Command(cmd, { args});
    await command.output();
};

await createFolderIfNeed(tmpPath);

const tmpFiles = await getFiles(tmpPath);

const connectionFileId = 'connect-ssh-proxy-tunnel-command';

const connectSshProxyTunnelFiles = tmpFiles
    .filter(file => file.includes(APP_ID))
    .filter(file => file.includes('-b-'))
    .filter(file => file.endsWith(connectionFileId));

const connectSshProxyTunnelEpochs = connectSshProxyTunnelFiles
    .filter(file => file.endsWith(connectionFileId))
    .map(file => file.split('-')[3])
    .sort()
    .reverse();

await killAllSshTunnelsByPort(LOCAL_TEST_PORT);

if (connectSshProxyTunnelEpochs.length) {
    killAllSshTunnelsByPort(LOCAL_PORT);

    await sleep(1000);

    console.log('Starting SSH tunnel connection B.');
    const connectSshProxyTunnelCmdFile = connectSshProxyTunnelFiles
        .find(connectSshProxyTunnelFile => connectSshProxyTunnelFile.includes(connectSshProxyTunnelEpochs[0]))
    const connectSshProxyTunnelCmd = await Deno.readTextFile(`${tmpPath}${connectSshProxyTunnelCmdFile}`);
    await connectSshProxyTunnel(connectSshProxyTunnelCmd);
    await apiTest();

    console.log('SSH tunnel connection B connected.');
}

let secondsLeftForLoopRetrigger = 0;
let timeout = 0;

const retrySleep = async () => {
    const sleepingTimeSeconds = secondsLeftForLoopRetrigger;
    if (sleepingTimeSeconds > 0) {
        console.log(`Waiting for ${sleepingTimeSeconds} seconds to start again.`);
        await sleep(sleepingTimeSeconds * 1000);
    }
};

const loop = () => {
    clearTimeout(timeout);

    timeout = setTimeout(async () => {
        while(true) {
            try {
                const startTime = performance.now();
                secondsLeftForLoopRetrigger = LOOP_INTERVAL_MIN * 60;
                await proxy();
                const endTime = performance.now();
                console.log(`Proxy loop finished in ${Number((endTime - startTime) / 1000).toFixed(0)} seconds.`);
            }
            catch(err) {
                console.log(`Proxy loop caught an error.`, err);
            }

            await retrySleep();
        }
    });
};

loop();

setInterval(() => {
    secondsLeftForLoopRetrigger = secondsLeftForLoopRetrigger - 1;
    const secondsLeftForLoopTimeout = (LOOP_TIMEOUT_MIN) * 60 + secondsLeftForLoopRetrigger;

    if (secondsLeftForLoopTimeout < 0) {
        console.log(`Reached timeout interval of ${LOOP_TIMEOUT_MIN} minutes, restarting the loop.`);
        loop();
    }
}, 1000);

const proxy = async () => {
    // Store for deleting later on in the process.
    const previousDroplets = await listDroplets();

    const epoch = Number(new Date());

    const types = ['b', 'a'];
    const dropletIds: number[] = [];
    const dropletIps: number[] = [];

    let typeIndex = 0;
    while (typeIndex < types.length) {
        const type = types[typeIndex];

        const regions = (await listRegions())
            .regions.filter((region: any) => region.sizes.includes(DROPLET_SIZE));
        const slugs = regions
            .map((region: any) => region.slug)
            .sort(() => (Math.random() > 0.5) ? 1 : -1);
        const dropletRegion = slugs[0];
        const dropletName = `${APP_ID}-${type}-${epoch}`;

        const passphrase = crypto.randomBytes(64).toString('hex');
        const keyPath = `${tmpPath}${dropletName}`;
        const createSshKeyCmd = `${srcPath}generate-ssh-key.exp ${passphrase} ${keyPath} ${KEY_ALGORITHM}`;
        // @ts-ignore: because
        const createSshKeyProcess = Deno.run({ cmd: createSshKeyCmd.split(' ') });
        await createSshKeyProcess.status();

        const publicKey = await Deno.readTextFile(`${keyPath}.pub`);
        const publicKeyId = await addKey(publicKey, dropletName);
        const userData = buildUserData();

        const createdDroplet = await createDroplet(dropletRegion, dropletName, DROPLET_SIZE, publicKeyId, userData);
        const dropletId = createdDroplet.droplet.id;
        dropletIds.push(dropletId);
        console.log('Created droplet.', { DROPLET_SIZE, dropletRegion, dropletName, dropletId });

        let dropletIp = null;
        while (!dropletIp) {
            const list = await listDroplets();
            const droplets = list.droplets;

            if (list && droplets) {
                const droplet = droplets.find((droplet: any) => droplet.id == createdDroplet.droplet.id);

                if (droplet && droplet.networks.v4.length) {
                    dropletIp = droplet.networks.v4.filter((network: any) => network.type == 'public')[0]['ip_address'];
                }
            }
        }
        dropletIps.push(dropletIp);
        console.log(`Found network at ${dropletIp}.`);

        const connectSshProxyTunnelCmd = `${srcPath}connect-ssh-tunnel.exp ${passphrase} ${dropletIp} root ${LOCAL_PORT} ${REMOTE_PORT} ${keyPath}`;
        Deno.writeTextFileSync(`${tmpPath}${dropletName}-connect-ssh-proxy-tunnel-command`, connectSshProxyTunnelCmd);

        if (type === 'a') {
            console.log('Starting to fetch host keys.');
            const hostKeyB = await getHostKey(dropletIds[0]);
            const hostKeyA = await getHostKey(dropletIds[1]);
            console.log('Successfully fetched host keys.');

            console.log('Starting to add host keys to known hosts.');
            Deno.writeTextFileSync(knownHostsPath, `${dropletIps[0]} ssh-${KEY_ALGORITHM} ${hostKeyB}\n`, { append: true });
            Deno.writeTextFileSync(knownHostsPath, `${dropletIps[1]} ssh-${KEY_ALGORITHM} ${hostKeyA}\n`, { append: true });
            console.log('Successfully added host keys to known hosts.');

            console.log('Starting SSH tunnel connection test.');
            let isConnectable = false;
            while(!isConnectable) {
                // @ts-ignore: because
                const openSshProxyTunnelTestProcess = Deno.run({
                    cmd: connectSshProxyTunnelCmd.replace(`${LOCAL_PORT}`, `${LOCAL_TEST_PORT}`).split(' '),
                    stdout: 'piped',
                    stderr: 'piped',
                    stdin: 'null'
                });
                const output = new TextDecoder().decode(await openSshProxyTunnelTestProcess.stderrOutput());
                isConnectable = !output;
            }
            console.log('Successfully finished SSH tunnel connection test.');

            console.log('Starting API test (1).');
            await apiTest(`http://localhost:${LOCAL_TEST_PORT}`);
            console.log('Successfully finished API test (1).');

            await killAllSshTunnelsByPort(LOCAL_TEST_PORT);
            await killAllSshTunnelsByPort(LOCAL_PORT);

            await sleep(1000);

            console.log('Starting SSH tunnel connection A.');
            await connectSshProxyTunnel(connectSshProxyTunnelCmd);
            console.log('SSH tunnel connection A connected.');

            console.log('Starting API test (2).');
            await apiTest();
            console.log('Successfully finished API test (2).');
        }

        typeIndex = typeIndex + 1;
    }

    const keys = await listKeys();
    const deletableKeyIds = keys['ssh_keys']
        .filter((key: any) => key.name.includes(APP_ID))
        .map((key: any) => key.id);
    await deleteKeys(deletableKeyIds);

    const deletableDropletIds = previousDroplets.droplets
        .filter((droplet: any) => droplet.name.includes(APP_ID))
        .map((droplet: any) => droplet.id);
    await deleteDroplets(deletableDropletIds);
};
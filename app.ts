import * as path from 'https://deno.land/std/path/mod.ts';
import { exists } from 'https://deno.land/std/fs/mod.ts';
import * as uuid from 'jsr:@std/uuid';
import { parse } from 'https://deno.land/std/flags/mod.ts';
import * as crypto from 'node:crypto';

const __dirname = path.dirname(path.fromFileUrl(import.meta.url));
const args = parse(Deno.args);
const TOKEN = args.t;
const INTERVAL_MIN = args.i;
const ERROR_INTERVAL_MIN = 1;
const LOCAL_TEST_PORT = 8887
const LOCAL_PORT = 8888;
const baseUrl = 'https://api.digitalocean.com/v2';
const userData = `
#cloud-config
runcmd:
    - sudo apt install tinyproxy -y
    - echo "Port 8888" > nano tinyproxy.conf
    - echo "Listen 127.0.0.1" > nano tinyproxy.conf
    - echo "Timeout 600" > nano tinyproxy.conf
    - echo "Allow 127.0.0.1" > nano tinyproxy.conf
    - tinyproxy -d -c tinyproxy.conf

    - echo "PasswordAuthentication no" > sudo nano /etc/ssh/sshd_config
`;
const appId = 'proxy-loop';
const tmpPath = `${__dirname}/.tmp/`;
const srcPath = `${__dirname}/src/`;
const killAllSshTunnelsCmd = `pkill -f ${tmpPath}${appId}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const getFiles = async (path) => {
    const fileNames: string[] = [];

    for await (const dirEntry of Deno.readDir(path)) {
      if (dirEntry.isFile) {
        fileNames.push(dirEntry.name);
      }
    }

    return fileNames;
};

const createFolderIfNeed = async (path) => {
    if (!await exists(path)) {
        await Deno.mkdir(path);
    }
};

const curlTest = async () => {
    let canGet = false;

    while(!canGet) {
        try {
            canGet = await listRegions();
        }
        catch(err) {
            await sleep(1000);
        }
    }
};

const listRegions = async () => {
    const headers = {
        Authorization: `Bearer ${TOKEN}`
    };
    const res = await fetch(`${baseUrl}/regions`, { method: 'GET', headers });
    const json: any = await res.json();
    return json;
};

const listDroplets = async () => {
    const headers = {
        Authorization: `Bearer ${TOKEN}`
    };
    const res = await fetch(`${baseUrl}/droplets`, { method: 'GET', headers });
    const json: any = await res.json();
    return json;
};

const listKeys = async () => {
    const headers = {
        Authorization: `Bearer ${TOKEN}`
    };
    const res = await fetch(`${baseUrl}/account/keys`, { method: 'GET', headers });
    const json: any = await res.json();
    return json;
};

const createDroplet = async (region, name, size, publicKey, userData) => {
    const headers = {
        Authorization: `Bearer ${TOKEN}`,
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

const deleteDroplets = async (ids) => {
    let index = 0;

    while(index < ids.length) {
        const id = ids[index];
        const headers = {
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        };
        await fetch(`${baseUrl}/droplets/${id}`, { method: 'DELETE', headers });
        console.log(`Deleted droplet: ${id}.`);
        index = index + 1;
    }
};

const deleteKeys = async (ids) => {
    let index = 0;

    while(index < ids.length) {
        const id = ids[index];
        const headers = {
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        };
        await fetch(`${baseUrl}/account/keys/${id}`, { method: 'DELETE', headers });
        console.log(`Deleted key: ${id}.`);
        index = index + 1;
    }
};

const addKey = async (publicKey, name) => {
    const headers = {
        Authorization: `Bearer ${TOKEN}`,
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

const connectSshProxyTunnel = async (cmd) => {
    const connectSshProxyTunnelProcess = Deno.run({
        cmd: cmd.split(' '),
        stdout: 'piped',
        stderr: 'piped',
        stdin: 'null'
    });
    new TextDecoder().decode(await connectSshProxyTunnelProcess.stderrOutput());
};

const killAllSshTunnels = (cmd) => {
    Deno.run({
        cmd: cmd.split(' '),
        stdout: 'null',
        stderr: 'null',
        stdin: 'null'
    });
};

const retrySleep = async() => {
    if (INTERVAL_MIN > 0) {
        console.log(`Waiting for ${INTERVAL_MIN} minutes to start again.`);
        await sleep(INTERVAL_MIN * 60 * 1000);
    }
};

const errorSleep = async() => {
    console.log(`Waiting for ${ERROR_INTERVAL_MIN} minutes to start again due to error.`);
    await sleep(ERROR_INTERVAL_MIN * 60 * 1000);
};


await createFolderIfNeed(tmpPath);

const tmpFiles = await getFiles(tmpPath);

const connectionFileId = 'connect-ssh-proxy-tunnel-command';

const connectSshProxyTunnelFiles = tmpFiles
    .filter(file => file.includes(appId))
    .filter(file => file.includes('-b-'))
    .filter(file => file.endsWith(connectionFileId));

const connectSshProxyTunnelEpochs = connectSshProxyTunnelFiles
    .filter(file => file.endsWith(connectionFileId))
    .map(file => file.split('-')[3])
    .sort()
    .reverse();

if (connectSshProxyTunnelEpochs.length) {
    killAllSshTunnels(killAllSshTunnelsCmd);

    await sleep(1000);

    console.log('Starting SSH tunnel connection B.');
    const connectSshProxyTunnelCmdFile = connectSshProxyTunnelFiles
        .find(connectSshProxyTunnelFile => connectSshProxyTunnelFile.includes(connectSshProxyTunnelEpochs[0]))
    const connectSshProxyTunnelCmd = await Deno.readTextFile(`${tmpPath}${connectSshProxyTunnelCmdFile}`);
    await connectSshProxyTunnel(connectSshProxyTunnelCmd);
    await curlTest();
    console.log('SSH tunnel connection B connected .');
}

while (true) {
    try {
        console.log(`Proxy loop started.`);

        const startTime = performance.now();

        // Store for deleting later on in the process.
        const previousDroplets = await listDroplets();

        const dropletSize = 's-1vcpu-512mb-10gb';
        const epoch = Number(new Date());

        const types = ['b', 'a'];
        let typeIndex = 0;
        while (typeIndex < types.length) {
            const type = types[typeIndex];

            const regions = (await listRegions())
                .regions.filter(region => region.sizes.includes(dropletSize));
            const slugs = regions
                .map(region => region.slug)
                .sort(() => (Math.random() > 0.5) ? 1 : -1);
            const dropletRegion = slugs[0];
            const dropletName = `${appId}-${type}-${epoch}`;

            const passphrase = crypto.randomBytes(64).toString('hex');
            const keyPath = `${tmpPath}${dropletName}`;
            const createSshKeyCmd = `${srcPath}generate-ssh-key.exp ${passphrase} ${keyPath}`;
            const createSshKeyProcess = Deno.run({ cmd: createSshKeyCmd.split(' ') });
            await createSshKeyProcess.status();

            const publicKey = await Deno.readTextFile(`${keyPath}.pub`);
            const publicKeyId = await addKey(publicKey, dropletName);

            const createdDroplet = await createDroplet(dropletRegion, dropletName, dropletSize, publicKeyId, userData);
            console.log('Created droplet.', { dropletSize, dropletRegion, dropletName });

            let ip = null;
            while (!ip) {
                const list = await listDroplets();
                const droplets = list.droplets;

                if (list && droplets) {
                    const droplet = droplets.find(droplet => droplet.id == createdDroplet.droplet.id);

                    if (droplet && droplet.networks.v4.length) {
                        ip = droplet.networks.v4.filter(network => network.type == 'public')[0]['ip_address'];
                    }
                }
            }
            console.log(`Found network at ${ip}.`);

            const connectSshProxyTunnelCmd = `${srcPath}connect-ssh-tunnel.exp ${passphrase} ${ip} root ${LOCAL_PORT} ${keyPath}`;
            Deno.writeTextFileSync(`${tmpPath}${dropletName}-connect-ssh-proxy-tunnel-command`, connectSshProxyTunnelCmd);

            if (type === 'a') {
                console.log('Starting SSH tunnel connection test.');
                let isConnectable = false;
                while(!isConnectable) {
                    const openSshProxyTunnelTestCmd = `ssh -o StrictHostKeyChecking=accept-new root@${ip}`;
                    const openSshProxyTunnelTestProcess = Deno.run({
                        cmd: openSshProxyTunnelTestCmd.split(' '),
                        stdout: 'piped',
                        stderr: 'piped',
                        stdin: 'null'
                    });
                    const output = new TextDecoder().decode(await openSshProxyTunnelTestProcess.stderrOutput());

                    isConnectable = output.includes('Permission denied');
                    if (!isConnectable) {
                        await sleep(1000);
                    }
                }
                console.log('Successfully finished SSH tunnel connection test.');

                killAllSshTunnels(killAllSshTunnelsCmd);

                await sleep(1000);

                console.log('Starting SSH tunnel connection A.');
                await connectSshProxyTunnel(connectSshProxyTunnelCmd);
                console.log('SSH tunnel connection A connected .');

                console.log('Starting curl test.');
                await curlTest();
                console.log('Successfully finished curl test.');
            }

            typeIndex = typeIndex + 1;
        }

        const keys = await listKeys();
        const deletableKeyIds = keys['ssh_keys']
            .filter(key => key.name.includes(appId))
            .map(key => key.id);
        await deleteKeys(deletableKeyIds);

        const deletableDropletIds = previousDroplets.droplets
            .filter(droplet => droplet.name.includes(appId))
            .map(droplet => droplet.id);
        await deleteDroplets(deletableDropletIds);

        const endTime = performance.now();
        console.log(`Proxy loop finished in ${Number((endTime - startTime) / 1000).toFixed(0)} seconds.`);

        await retrySleep();
    }
    catch(error) {
        console.log({ error });
        await retrySleep();
        await errorSleep();
    }
}

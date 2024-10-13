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
`;
const appId = 'proxy-loop';
const tmpPath = `${__dirname}/.tmp/`;
const srcPath = `${__dirname}/src/`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const createFolderIfNeed = async (path) => {
    if (!await exists(path)) {
        await Deno.mkdir(path);
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

const addPublicKey = async (publicKey, name) => {
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

const connectSshProxyTunnel = async (passphrase, ip, port, keyPath) => {
    const connectSshProxyTunnelCommand = `${srcPath}connect-ssh-tunnel.exp ${passphrase} ${ip} root ${port} ${keyPath}`;
    const connectSshProxyTunnelProcess = Deno.run({
        cmd: connectSshProxyTunnelCommand.split(' '),
        stdout: 'piped',
        stderr: 'piped',
        stdin: 'null'
    });
    new TextDecoder().decode(await connectSshProxyTunnelProcess.stderrOutput());
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

while (true) {
    try {
        asd
        const startTime = performance.now();

        await createFolderIfNeed(tmpPath);

        console.log(`Proxy loop started.`);

        const dropletSize = 's-1vcpu-512mb-10gb';
        const regions = (await listRegions())
            .regions.filter(region => region.sizes.includes(dropletSize));
        const slugs = regions
            .map(region => region.slug)
            .sort(() => (Math.random() > 0.5) ? 1 : -1);
        const dropletRegion = slugs[0];
        const dropletName = `${appId}-${uuid.v1.generate()}`;

        const passphrase = crypto.randomBytes(64).toString('hex');
        const keyPath = `${tmpPath}${dropletName}`;
        const createSshKeyCommand = `${srcPath}generate-ssh-key.exp ${passphrase} ${keyPath}`;
        const createSshKeyProcess = Deno.run({ cmd: createSshKeyCommand.split(' ') });
        await createSshKeyProcess.status();

        const publicKey = await Deno.readTextFile(`${keyPath}.pub`);
        const publicKeyId = await addPublicKey(publicKey, dropletName);

        // Store for deleting later on in the process.
        const previousDroplets = await listDroplets();

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

        console.log('Starting SSH tunnel connection test (1).');
        let isConnectable = false;
        while(!isConnectable) {
            const openSshProxyTunnelTestCommand = `ssh -o StrictHostKeyChecking=accept-new root@${ip}`;
            const openSshProxyTunnelProcess = Deno.run({
                cmd: openSshProxyTunnelTestCommand.split(' '),
                stdout: 'piped',
                stderr: 'piped',
                stdin: 'null'
            });
            const output = new TextDecoder().decode(await openSshProxyTunnelProcess.stderrOutput());

            isConnectable = output.includes('Permission denied');
            if (!isConnectable) {
                await sleep(1000);
            }
        }
        console.log('Successfully finished SSH tunnel connection test (1).');

        // httping -x localhost:8888 -g http://google.com

        /*
        console.log('Starting SSH tunnel connection test (2).');
        await connectSshProxyTunnel(passphrase, ip, LOCAL_TEST_PORT, keyPath);
        console.log('Successfully finished SSH tunnel connection test (2).');
        */

        const killAllSshTunnelsCommand = `pkill -f ${tmpPath}${appId}`;
        Deno.run({
            cmd: killAllSshTunnelsCommand.split(' '),
            stdout: 'null',
            stderr: 'null',
            stdin: 'null'
        });

        await sleep(1000);

        console.log('Starting SSH tunnel connection.');
        await connectSshProxyTunnel(passphrase, ip, LOCAL_PORT, keyPath);
        console.log('SSH tunnel connected.');

        const deletableDropletIds = previousDroplets.droplets
            .filter(droplet => droplet.name.includes('proxy'))
            .map(droplet => droplet.id);
        await deleteDroplets(deletableDropletIds);
        console.log('Deleted all previous droplets.');

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

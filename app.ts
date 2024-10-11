import * as uuid from 'jsr:@std/uuid';
import { parse } from "https://deno.land/std/flags/mod.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = parse(Deno.args);
const TOKEN = args.t;
const REFRESH_INTERVAL = args.r;
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
        console.log(`Deleted droplet: ${id}`);
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

while (true) {
    const dropletSize = 's-1vcpu-512mb-10gb';
    const regions = (await listRegions())
        .regions.filter(region => region.sizes.includes(dropletSize));
    const slugs = regions
        .map(region => region.slug)
        .sort(() => (Math.random() > 0.5) ? 1 : -1);
    const dropletRegion = slugs[0];
    const dropletName = `proxy-${uuid.v1.generate()}`;

    const keyPath = `/home/me/.ssh/proxy-looper-key-${dropletName}`;
    const createSshKeyCommand = `./generate-ssh-key.exp ${keyPath}`;
    const createSshKeyProcess = Deno.run({ cmd: createSshKeyCommand.split(' ') });
    await createSshKeyProcess.status();

    const publicKey = await Deno.readTextFile(`${keyPath}.pub`);
    const publicKeyId = await addPublicKey(publicKey, dropletName);

    // Store for deleting later on in the process.
    const previousDroplets = await listDroplets();

    const createdDroplet = await createDroplet(dropletRegion, dropletName, dropletSize, publicKeyId, userData);
    console.log('Created droplet.', { dropletSize, dropletRegion, dropletName });
``
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
    console.log('Found network at', ip);

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
        console.log('SSH connection test: ', output);

        isConnectable = output.includes('Permission denied');
        if (!isConnectable) {
            await sleep(5 * 1000);
        }
    }

    const killAllSshTunnelsCommand = `pkill -f proxy-looper`;
    Deno.run({
        cmd: killAllSshTunnelsCommand.split(' '),
        stdout: 'null',
        stderr: 'null',
        stdin: 'null'
    });

    await sleep(1000);

    const openSshProxyTunnelCommand = `./connect-ssh-tunnel.exp ${ip} root ${keyPath}`;
    console.log({ openSshProxyTunnelCommand });
    const openSshProxyTunnelProcess = Deno.run({
        cmd: openSshProxyTunnelCommand.split(' '),
        stdout: 'piped',
        stderr: 'piped',
        stdin: 'null'
    });
    const output = new TextDecoder().decode(await openSshProxyTunnelProcess.stderrOutput());
    console.log({ output });
    console.log('SSH tunnel connected.');

    const deletableDropletIds = previousDroplets.droplets
        .filter(droplet => droplet.name.includes('proxy'))
        .map(droplet => droplet.id);
    await deleteDroplets(deletableDropletIds);
    console.log('Deleted all previous droplets.');

    await sleep(REFRESH_INTERVAL * 60 * 1000);
}

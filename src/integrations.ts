// deno-lint-ignore-file no-explicit-any

import jwt from 'npm:jsonwebtoken';
import { encodeBase64 } from 'jsr:@std/encoding/base64';
import { existsSync } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import * as core from './core.ts';
import * as lib from './lib.ts';
import * as models from './models.ts';
import * as integrations from './integrations.ts';
import { logger as _logger } from './logger.ts';

const logger = _logger.get();
const { config } = models;

import {
    Proxy,
    CreateDigitalOceanInstance,
    CreateHetznerInstance,
    CreateVultrInstance,
    ClientScriptFileName
} from './types.ts';

export const shell = {
	privateKey: {
		create: async (
            keyPath: string,
            passphrase: string,
        ) => {
            const cmd =
                `${config().SCRIPT_PATH}/${ClientScriptFileName.GENERATE_SSH_KEY_FILE_NAME} ${passphrase} ${keyPath} ${config().SSH_KEY_ALGORITHM} ${config().SSH_KEY_LENGTH}`;
            const publicKeyPath = `${keyPath}.pub`;
            integrations.shell.command(cmd);

            while (true) {
                try {
                    const file = Deno.readTextFileSync(publicKeyPath);
                    if (file) {
                        return file;
                    }
                }
                catch(_) {
                    _;
                }
                await lib.sleep(1000);
            }
        }
    },
    pkill: async (input: string) => {
        const cmd = 'pkill';
        const args = `-f ${input}`.split(' ');
        const command = new Deno.Command(cmd, { args });
        await command.output();
    },
    command: (input: string) => {
        const args = input.split(' ');
        const cmd = args[0];
        args.shift();
        const response = new Deno.Command(cmd, { args });
        const output = response.outputSync()
        const textDecoder = new TextDecoder();
        return [{
            stdout: textDecoder.decode(output.stdout),
            stderr: textDecoder.decode(output.stderr)
        }];
    }
};

export const fs = {
    ensureFolder: (path: string) => {
        !existsSync(path) && Deno.mkdirSync(path);
    },
    hostKey: {
        save: (proxy: Proxy) => {
            const isFoundFromKnownHostsFile = Deno
                .readTextFileSync(config().SSH_KNOWN_HOSTS_PATH)
                .includes(proxy.sshHostKey);

            !isFoundFromKnownHostsFile && Deno.writeTextFileSync(
                config().SSH_KNOWN_HOSTS_PATH,
                `${proxy.instanceIp} ssh-${config().SSH_KEY_ALGORITHM} ${proxy.sshHostKey}\n`,
                { append: true },
            );
        },
    },
};

export const kv = {
    cloudflare: {
        heartbeat: async (): Promise<boolean> => {
            try {
                const options = {
                    method: 'GET',
                    signal: AbortSignal.timeout(config().HEARTBEAT_INTERVAL_SEC),
                };
                const res = await fetch(config().CLOUDFLARE_BASE_URL, core.useProxy(options));
                await res.json();
                logger.info('Heartbeat.');
                return true;
            }
            catch(_) {
                return false;
            }
        },
        hostKey: {
            get: async (
                proxy: Proxy,
                jwtSecret: string,
            ) => {
                while (!proxy.sshHostKey) {
                    try {
                        const headers = {
                            Authorization: `Bearer ${config().CLOUDFLARE_API_KEY}`,
                        };
                        const options = { method: 'GET', headers };
                        const url =
                            `${config().CLOUDFLARE_BASE_URL}/accounts/${config().CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${config().CLOUDFLARE_KV_NAMESPACE}/values/${proxy.proxyUuid}`;
                        const res = await fetch(url, core.useProxy(options));
                        const text = await res.text();
                        text.includes('errors') && !text.includes('key not found') && logger.error('kv.cloudflare.hostKey.get error ', text);
                        const decoded = jwt.verify(text, jwtSecret);
                        proxy.sshHostKey = decoded.sshHostKey;
                        logger.info(`Fetched host key for proxy ${proxy.proxyUuid}.`);
                    } catch (_) {
                        await lib.sleep(1000);
                    }
                }

                return proxy;
            },
        }
    },
};

export const compute = {
	digital_ocean: {
        instanceSize: config().DIGITAL_OCEAN_INSTANCE_SIZE,
        instanceImage: config().DIGITAL_OCEAN_INSTANCE_IMAGE,
        userData: {
            format: (userData: string) => {
                return userData;
            }
        },
        regions: {
            all: async () => {
                const headers = {
                    Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
                };
                const options = { method: 'GET', headers };
                const res = await fetch(`${config().DIGITAL_OCEAN_BASE_URL}/regions`, core.useProxy(options));
                const json = await res.json();
                const regions = json.regions;
                !regions && logger.error('digital_ocean.regions.list error ', json);

                return regions
                    .filter((region: any) => region.sizes.includes(compute.digital_ocean.instanceSize))
                    .map((region: any) => region.slug);
            },
            parse: async () => {
                const regions = await compute.digital_ocean.regions.all();
                return regions
                    .filter((region: string) =>
                        !config().INSTANCE_COUNTRIES_DISABLED.includes(
                            config().DIGITAL_OCEAN_REGIONS[region.replace(/[0-9]/g, '')]
                        )
                    ).map((region: string) => [region, config().DIGITAL_OCEAN_REGIONS[region.replace(/[0-9]/g, '')]]);
            },
        },
        countries: {
            list: async () => {
                const regions = await compute.digital_ocean.regions.all();
                return regions
                    .map((region: string) => config().DIGITAL_OCEAN_REGIONS[region.replace(/[0-9]/g, '')]);
            },
        },
        instances: {
            create: async (args: CreateDigitalOceanInstance) => {
                const headers = {
                    Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const options = {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(args),
                };
                const res = await fetch(`${config().DIGITAL_OCEAN_BASE_URL}/droplets`, core.useProxy(options));
                const json = await res.json();
                !json.droplet && logger.error('compute.digital_ocean.instances.create error', json);
                const instanceIp = await compute.digital_ocean.ip.get(json.droplet.id);
                return {
                    instanceId: json.droplet.id,
                    instanceIp,
                };
            },
            get: async (dropletId: string) => {
                const headers = {
                    Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
                };
                const options = { method: 'GET', headers };
                const res = await fetch(`${config().DIGITAL_OCEAN_BASE_URL}/droplets/${dropletId}`, core.useProxy(options));
                const json = await res.json();
                return json.droplet;
            },
            list: async () => {
                const headers = {
                    Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
                };
                const options = { method: 'GET', headers };
                const res = await fetch(`${config().DIGITAL_OCEAN_BASE_URL}/droplets`, core.useProxy(options));
                const json = await res.json();
                return json.droplets;
            },
            delete: async (ids: string[]) => {
                let index = 0;

                while (index < ids.length) {
                    const id = ids[index];
                    const headers = {
                        Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
                        'Content-Type': 'application/json',
                    };
                    const options = {
                        method: 'DELETE',
                        headers,
                    };
                    await fetch(`${config().DIGITAL_OCEAN_BASE_URL}/droplets/${id}`, core.useProxy(options));
                    logger.info(`Deleted Digital Ocean instance: ${id}.`);
                    index = index + 1;
                }
            },
        },
        keys: {
            add: async (
                publicKey: string,
                name: string,
            ) => {
                const headers = {
                    Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const body = {
                    name: name,
                    'public_key': publicKey,
                };
                const options = {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                };
                const res = await fetch(`${config().DIGITAL_OCEAN_BASE_URL}/account/keys`, core.useProxy(options));
                const json = await res.json();
                !json['ssh_key'] && logger.error('digital__ocean.keys.add error ', json);
                return json['ssh_key']['id'];
            },
            list: async () => {
                const headers = {
                    Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
                };
                const options = {
                    method: 'GET',
                    headers,
                };
                const res = await fetch(`${config().DIGITAL_OCEAN_BASE_URL}/account/keys`, core.useProxy(options));
                const json = await res.json();
                return json['ssh_keys'];
            },
            delete: async (ids: string[]) => {
                let index = 0;

                while (index < ids.length) {
                    const id = ids[index];
                    const headers = {
                        Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
                        'Content-Type': 'application/json',
                    };
                    const options = {
                        method: 'DELETE',
                        headers,
                    };
                    await fetch(`${config().DIGITAL_OCEAN_BASE_URL}/account/keys/${id}`, core.useProxy(options));
                    logger.info(`Deleted Digital Ocean ssh_key: ${id}.`);
                    index = index + 1;
                }
            },
        },
        ip: {
            get: async (dropletId: string) => {
                let ip = null;

                while (!ip) {
                    const droplet = await compute.digital_ocean.instances.get(dropletId);
                    if (droplet && droplet.networks.v4.length) {
                        ip = droplet.networks.v4.filter((network: any) =>
                            network.type == 'public'
                        )[0]['ip_address'];
                    }
                }

                return ip;
            },
        },
    },
	hetzner: {
        instanceSize: config().HETZNER_SERVER_TYPE,
        instanceImage: config().HETZNER_INSTANCE_IMAGE,
        userData: {
            format: (userData: string) => {
                return userData;
            }
        },
        regions: {
            all: async () => {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config().HETZNER_API_KEY}`
                };
                const options = { method: 'GET', headers };
                const res = await fetch(`${config().HETZNER_BASE_URL}/datacenters`, core.useProxy(options));
                const json = await res.json();
                const serverTypeId = await compute.hetzner.serverTypes.getId(compute.hetzner.instanceSize);
                const regions = json
                    .datacenters
                    .filter((data: any) => data.server_types.available.includes(serverTypeId));
                return regions;
            },
            parse: async () => {
                const regions = await compute.hetzner.regions.all();
                return regions
                    .filter((data: any) =>
                        !config().INSTANCE_COUNTRIES_DISABLED.includes(data.location.country)
                    )
                    .map((data: any) => [data.name, data.location.country]);
            },
        },
        countries: {
            list: async () => {
                const regions = await compute.hetzner.regions.all();
                return regions
                    .map((data: any) => data.location.country);
            },
        },
        serverTypes: {
            getId: async (instanceSize: string) => {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config().HETZNER_API_KEY}`
                };
                const options = { method: 'GET', headers };
                const res = await fetch(`${config().HETZNER_BASE_URL}/server_types?per_page=50`, core.useProxy(options));
                const json = await res.json();
                const serverTypes = json.server_types;
                !serverTypes && logger.error('hetzner.serverTypes.list error ', json);

                const serverTypeId = serverTypes
                    .filter((serverType: any) => serverType.name === instanceSize)[0].id;
                return serverTypeId;
            },
        },
        instances: {
            create: async (args: CreateHetznerInstance) => {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config().HETZNER_API_KEY}`
                };
                const options = {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(args),
                };
                const res = await fetch(`${config().HETZNER_BASE_URL}/servers`, core.useProxy(options));
                const json = await res.json();
                !json.server && logger.error('compute.hetzner.instances.create error', json);
                return {
                    instanceId: json.server.id,
                    instanceIp: json.server.public_net.ipv4.ip,
                }
            },
            list: async () => {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config().HETZNER_API_KEY}`
                };
                const options = { method: 'GET', headers };
                const res = await fetch(`${config().HETZNER_BASE_URL}/servers`, core.useProxy(options));
                const json = await res.json();
                return json.servers;
            },
            delete: async (ids: string[]) => {
                let index = 0;

                while (index < ids.length) {
                    const id = ids[index];
                    const headers = {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${config().HETZNER_API_KEY}`
                    };
                    const options = {
                        method: 'DELETE',
                        headers,
                    };
                    await fetch(`${config().HETZNER_BASE_URL}/servers/${id}`, core.useProxy(options));
                    logger.info(`Deleted Hetzner instance: ${id}.`);
                    index = index + 1;
                }
            },
        },
        keys: {
            add: async (
                publicKey: string,
                name: string,
            ) => {
                const headers = {
                    Authorization: `Bearer ${config().HETZNER_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const body = {
                    name: name,
                    'public_key': publicKey,
                };
                const options = {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                };
                const res = await fetch(`${config().HETZNER_BASE_URL}/ssh_keys`, core.useProxy(options));
                const json = await res.json();
                return json['ssh_key']['id'];
            },
            list: async () => {
                const headers = {
                    Authorization: `Bearer ${config().HETZNER_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const options = {
                    method: 'GET',
                    headers,
                };
                const res = await fetch(`${config().HETZNER_BASE_URL}/ssh_keys`, core.useProxy(options));
                const json = await res.json();
                return json['ssh_keys'];
            },
            delete: async (ids: number[]) => {
                let index = 0;

                while (index < ids.length) {
                    const id = ids[index];
                    const headers = {
                        Authorization: `Bearer ${config().HETZNER_API_KEY}`,
                        'Content-Type': 'application/json',
                    };
                    const options = {
                        method: 'DELETE',
                        headers,
                    };
                    await fetch(`${config().HETZNER_BASE_URL}/ssh_keys/${id}`, core.useProxy(options));
                    logger.info(`Deleted Hetzner ssh_key: ${id}.`);
                    index = index + 1;
                }
            },
        },
    },
	vultr: {
        instanceSize: config().VULTR_INSTANCE_PLAN,
        instanceImage: config().VULTR_INSTANCE_IMAGE,
        userData: {
            format: (userData: string) => {
                return encodeBase64(userData);
            }
        },
        regions: {
            availability: async (regionId: string) => {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config().VULTR_API_KEY}`
                };
                const options = { method: 'GET', headers };
                const res = await fetch(`${config().VULTR_BASE_URL}/regions/${regionId}/availability`, core.useProxy(options));
                const json = await res.json();
                const availablePlans = json.available_plans;
                return availablePlans;
            },
            all: async () => {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config().VULTR_API_KEY}`
                };
                const options = { method: 'GET', headers };
                const res = await fetch(`${config().VULTR_BASE_URL}/regions`, core.useProxy(options));
                const json = await res.json();
                return json.regions;
            },
            parse: async () => {
                const regions = await compute.vultr.regions.all();
                return regions
                    .filter((data: any) =>
                        !config().INSTANCE_COUNTRIES_DISABLED.includes(data.country)
                    )
                    .filter(async(data: any) => {
                        const availablePlans = await compute.vultr.regions.availability(data.id);
                        return availablePlans.includes(compute.vultr.instanceSize);
                    })
                    .map((data: any) => [data.id, data.country]);
            },
        },
        countries: {
            list: async () => {
                const regions = await compute.vultr.regions.all();
                return regions
                    .map((data: any) => data.country);
            },
        },
        os: {
            getId: async (instanceImage: string) => {
                let results: any[] = [];
                let cursor = '';
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config().VULTR_API_KEY}`
                };
                const options = { method: 'GET', headers };

                let canLoop = true;
                while (canLoop) {
                    let url = `${config().VULTR_BASE_URL}/os?per_page=50`;
                    if (cursor) {
                        url = `${url}&cursor=${cursor}`;
                    }

                    const res = await fetch(url, core.useProxy(options));
                    const json = await res.json();

                    results = results.concat(json.os);
                    cursor = json.meta.links.next;
                    canLoop = cursor.length > 0;
                }

                const osId = results
                    .filter((os: any) => os.name === instanceImage)[0].id;
                return osId;
            },
        },
        instances: {
            create: async (args: CreateVultrInstance) => {
                const osId = await compute.vultr.os.getId(compute.vultr.instanceImage);
                args.os_id = osId;
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config().VULTR_API_KEY}`
                };
                const options = {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(args),
                };
                const res = await fetch(`${config().VULTR_BASE_URL}/instances`, core.useProxy(options));
                const json = await res.json();
                !json.instance && logger.error('compute.vultr.instances.create error', json);
                const instanceIp = await compute.vultr.ip.get(json.instance.id);
                return {
                    instanceId: json.instance.id,
                    instanceIp,
                }
            },
            get: async (instanceId: string) => {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config().VULTR_API_KEY}`
                };
                const options = { method: 'GET', headers };
                const res = await fetch(`${config().VULTR_BASE_URL}/instances/${instanceId}`, core.useProxy(options));
                const json = await res.json();
                return json.instance;
            },
            list: async () => {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config().VULTR_API_KEY}`
                };
                const options = { method: 'GET', headers };
                const res = await fetch(`${config().VULTR_BASE_URL}/instances`, core.useProxy(options));
                const json = await res.json();
                return json.instances;
            },
            delete: async (ids: number[]) => {
                let index = 0;

                while (index < ids.length) {
                    const id = ids[index];
                    const headers = {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${config().VULTR_API_KEY}`
                    };
                    const options = {
                        method: 'DELETE',
                        headers,
                    };
                    await fetch(`${config().VULTR_BASE_URL}/instances/${id}`, core.useProxy(options));
                    logger.info(`Deleted Vultr instance: ${id}.`);
                    index = index + 1;
                }
            },
        },
        keys: {
            add: async function(
                publicKey: string,
                name: string,
            ) {
                const headers = {
                    Authorization: `Bearer ${config().VULTR_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const body = {
                    name: name,
                    'ssh_key': publicKey,
                };
                const options = {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                };
                const res = await fetch(`${config().VULTR_BASE_URL}/ssh-keys`, core.useProxy(options));
                const json = await res.json();
                !json['ssh_key'] && logger.error('vultr.keys.add error ', json);
                return json['ssh_key']['id'];
            },
            list: async () => {
                const headers = {
                    Authorization: `Bearer ${config().VULTR_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const options = {
                    method: 'GET',
                    headers,
                };
                const res = await fetch(`${config().VULTR_BASE_URL}/ssh-keys`, core.useProxy(options));
                const json = await res.json();
                return json['ssh_keys'];
            },
            delete: async (ids: number[]) => {
                let index = 0;

                while (index < ids.length) {
                    const id = ids[index];
                    const headers = {
                        Authorization: `Bearer ${config().VULTR_API_KEY}`,
                        'Content-Type': 'application/json',
                    };
                    const options = {
                        method: 'DELETE',
                        headers,
                    };
                    await fetch(`${config().VULTR_BASE_URL}/ssh-keys/${id}`, core.useProxy(options));
                    logger.info(`Deleted Vultr ssh_key: ${id}.`);
                    index = index + 1;
                }
            },
        },
        ip: {
            get: async (instanceId: string) => {
                let ip = null;

                while (!ip) {
                    const instance = await compute.vultr.instances.get(instanceId);

                    if (instance && instance.main_ip !== '0.0.0.0') {
                        ip = instance.main_ip;
                    }
                }

                return ip;
            },
        },
    }
};
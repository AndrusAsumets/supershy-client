// deno-lint-ignore-file no-explicit-any

import jwt from 'npm:jsonwebtoken';
import { encodeBase64 } from 'jsr:@std/encoding/base64';
import * as lib from './lib.ts';
import { exists } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import { logger as _logger } from './logger.ts';

const logger = _logger.get();

import {
    TMP_PATH,
    KEY_ALGORITHM,
    KEY_LENGTH,
    KNOWN_HOSTS_PATH,
    GENERATE_SSH_KEY_FILE_NAME,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_KV_NAMESPACE,
    CLOUDFLARE_API_KEY,
    CLOUDFLARE_BASE_URL,
    HETZNER_API_KEY,
    HETZNER_BASE_URL,
    HETZNER_SERVER_TYPE,
    HETZNER_INSTANCE_IMAGE,
    DIGITAL_OCEAN_API_KEY,
    DIGITAL_OCEAN_BASE_URL,
    DIGITAL_OCEAN_INSTANCE_SIZE,
    DIGITAL_OCEAN_INSTANCE_IMAGE,
    VULTR_API_KEY,
    VULTR_BASE_URL,
    VULTR_INSTANCE_PLAN,
    VULTR_INSTANCE_IMAGE,
    HEARTBEAT_INTERVAL_SEC,
} from './constants.ts';

import {
    Connection,
    CreateDigitalOceanInstance,
    CreateHetznerInstance,
    CreateVultrInstance,
} from './types.ts';

export const shell = {
	privateKey: {
		create: async function (
            keyPath: string,
            passphrase: string,
        ) {
            const cmd =
                `${TMP_PATH}/${GENERATE_SSH_KEY_FILE_NAME} ${passphrase} ${keyPath} ${KEY_ALGORITHM} ${KEY_LENGTH}`;
            // @ts-ignore: because
            const process = Deno.run({ cmd: cmd.split(' ') });
            await process.status();
            const publicKey = await Deno.readTextFile(`${keyPath}.pub`);
            return publicKey;
        }
    },
    pkill: async function (input: string) {
        const cmd = 'pkill';
        const args = `-f ${input}`.split(' ');
        const command = new Deno.Command(cmd, { args });
        await command.output();
    },
    command: async function (input: string) {
        const args = input.split(' ');
        const cmd = args[0];
        args.shift();
        const response = new Deno.Command(cmd, { args });
        return await response.outputSync();
    }
};

export const fs = {
    ensureFolder: async function (path: string) {
        if (!await exists(path)) {
            await Deno.mkdir(path);
        }
    },
};

export const kv = {
    cloudflare: {
        heartbeat: async function (proxy: any = null) {
            const options: any = {
                method: 'GET',
                signal: AbortSignal.timeout(HEARTBEAT_INTERVAL_SEC),
            };
            if (proxy) {
                options.client = Deno.createHttpClient({ proxy });
            }
            const res = await fetch(CLOUDFLARE_BASE_URL, options);
            await res.json();
            logger.info('Heartbeat success.');
        },
        hostKey: {
            get: async function (
                connectionUuid: string,
                jwtSecret: string,
            ) {
                let hostKey: string = '';
                while (!hostKey) {
                    try {
                        const headers = {
                            Authorization: `Bearer ${CLOUDFLARE_API_KEY}`,
                        };
                        const options: any = { method: 'GET', headers };
                        const url =
                            `${CLOUDFLARE_BASE_URL}/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/values/${connectionUuid}`;
                        const res = await fetch(url, options);
                        const text = await res.text();
                        const decoded = jwt.verify(text, jwtSecret);
                        hostKey = decoded.hostKey;
                    } catch (_) {
                        await lib.sleep(1000);
                    }
                }

                return hostKey;
            },
            update: async function (
                connection: Connection,
                jwtSecret: string,
            ) {
                const { connectionUuid, instanceIp } = connection;

                connection.hostKey = await kv.cloudflare.hostKey.get(connection.connectionUuid, jwtSecret);
                logger.info(`Fetched host key for connection ${connectionUuid}.`);

                Deno.writeTextFileSync(
                    KNOWN_HOSTS_PATH,
                    `${instanceIp} ssh-${KEY_ALGORITHM} ${connection.hostKey}\n`,
                    { append: true },
                );
                logger.info(`Added host key for ${instanceIp} to known hosts.`);

                return connection;
            },
        }
    },
};

export const compute = {
	digital_ocean: {
        instanceSize: DIGITAL_OCEAN_INSTANCE_SIZE,
        instanceImage: DIGITAL_OCEAN_INSTANCE_IMAGE,
        userData: {
            format: function (userData: string) {
                return userData;
            }
        },
        regions: {
            list: async function (proxy: any = null) {
                const headers = {
                    Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
                };
                const options: any = { method: 'GET', headers };
                if (proxy) {
                    options.client = Deno.createHttpClient({ proxy });
                }
                const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/regions`, options);
                const json: any = await res.json();
                const regions = json
                    .regions
                    .filter((region: any) => region.sizes.includes(compute.digital_ocean.instanceSize))
                    .map((region: any) => region.slug)
                return regions;
            },
        },
        instances: {
            create: async function (args: CreateDigitalOceanInstance) {
                const headers = {
                    Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/droplets`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(args),
                });
                const json: any = await res.json();
                if (!json.droplet) logger.error('compute.digital_ocean.instances.create error', json);
                const instanceIp = await compute.digital_ocean.ip.get(json.droplet.id);
                return {
                    instanceId: json.droplet.id,
                    instanceIp,
                };
            },
            get: async function (dropletId: string) {
                const headers = {
                    Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
                };
                const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/droplets/${dropletId}`, { method: 'GET', headers });
                const json: any = await res.json();
                return json.droplet;
            },
            list: async function () {
                const headers = {
                    Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
                };
                const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/droplets`, { method: 'GET', headers });
                const json: any = await res.json();
                return json.droplets;
            },
            delete: async function (ids: number[]) {
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
                    logger.info(`Deleted Digital Ocean instance: ${id}.`);
                    index = index + 1;
                }
            },
        },
        keys: {
            add: async function(publicKey: string, name: string) {
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
            },
            list: async function () {
                const headers = {
                    Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
                };
                const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/account/keys`, {
                    method: 'GET',
                    headers,
                });
                const json: any = await res.json();
                return json['ssh_keys'];
            },
            delete: async function (ids: number[]) {
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
                    logger.info(`Deleted Digital Ocean ssh_key: ${id}.`);
                    index = index + 1;
                }
            },
        },
        ip: {
            get: async function (dropletId: string) {
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
        instanceSize: HETZNER_SERVER_TYPE,
        instanceImage: HETZNER_INSTANCE_IMAGE,
        userData: {
            format: function (userData: string) {
                return userData;
            }
        },
        regions: {
            list: async function (proxy: any = null) {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${HETZNER_API_KEY}`
                };
                const options: any = { method: 'GET', headers };
                if (proxy) {
                    options.client = Deno.createHttpClient({ proxy });
                }
                const res = await fetch(`${HETZNER_BASE_URL}/datacenters`, options);
                const json: any = await res.json();
                const serverTypeId = await compute.hetzner.serverTypes.getId(proxy, compute.hetzner.instanceSize);
                const regions = json
                    .datacenters
                    .filter((data: any) => data.server_types.available.includes(serverTypeId))
                    .map((data: any) => data.name);
                return regions;
            },
        },
        serverTypes: {
            getId: async function (proxy: any = null, instanceSize: string) {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${HETZNER_API_KEY}`
                };
                const options: any = { method: 'GET', headers };
                if (proxy) {
                    options.client = Deno.createHttpClient({ proxy });
                }
                const res = await fetch(`${HETZNER_BASE_URL}/server_types?per_page=50`, options);
                const json: any = await res.json();
                const serverTypeId = json.server_types
                    .filter((serverType: any) => serverType.name === instanceSize)[0].id;
                return serverTypeId;
            },
        },
        instances: {
            create: async function (args: CreateHetznerInstance) {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${HETZNER_API_KEY}`
                };
                const res = await fetch(`${HETZNER_BASE_URL}/servers`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(args),
                });
                const json: any = await res.json();
                if (!json.server) logger.error('compute.hetzner.instances.create error', json);
                return {
                    instanceId: json.server.id,
                    instanceIp: json.server.public_net.ipv4.ip,
                }
            },
            list: async function () {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${HETZNER_API_KEY}`
                };
                const res = await fetch(`${HETZNER_BASE_URL}/servers`, { method: 'GET', headers });
                const json: any = await res.json();
                return json.servers;
            },
            delete: async function (ids: number[]) {
                let index = 0;

                while (index < ids.length) {
                    const id = ids[index];
                    const headers = {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${HETZNER_API_KEY}`
                    };
                    await fetch(`${HETZNER_BASE_URL}/servers/${id}`, {
                        method: 'DELETE',
                        headers,
                    });
                    logger.info(`Deleted Hetzner instance: ${id}.`);
                    index = index + 1;
                }
            },
        },
        keys: {
            add: async function(publicKey: string, name: string) {
                const headers = {
                    Authorization: `Bearer ${HETZNER_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const body = {
                    name: name,
                    'public_key': publicKey,
                };
                const res = await fetch(`${HETZNER_BASE_URL}/ssh_keys`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                });
                const json: any = await res.json();
                return json['ssh_key']['id'];
            },
            list: async function () {
                const headers = {
                    Authorization: `Bearer ${HETZNER_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const res = await fetch(`${HETZNER_BASE_URL}/ssh_keys`, {
                    method: 'GET',
                    headers,
                });
                const json: any = await res.json();
                return json['ssh_keys'];
            },
            delete: async function (ids: number[]) {
                let index = 0;

                while (index < ids.length) {
                    const id = ids[index];
                    const headers = {
                        Authorization: `Bearer ${HETZNER_API_KEY}`,
                        'Content-Type': 'application/json',
                    };
                    await fetch(`${HETZNER_BASE_URL}/ssh_keys/${id}`, {
                        method: 'DELETE',
                        headers,
                    });
                    logger.info(`Deleted Hetzner ssh_key: ${id}.`);
                    index = index + 1;
                }
            },
        },
    },
	vultr: {
        instanceSize: VULTR_INSTANCE_PLAN,
        instanceImage: VULTR_INSTANCE_IMAGE,
        userData: {
            format: function (userData: string) {
                return encodeBase64(userData);
            }
        },
        regions: {
            availability: async function (proxy: any = null, regionId: string) {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${VULTR_API_KEY}`
                };
                const options: any = { method: 'GET', headers };
                if (proxy) {
                    options.client = Deno.createHttpClient({ proxy });
                }
                const res = await fetch(`${VULTR_BASE_URL}/regions/${regionId}/availability`, options);
                const json: any = await res.json();
                const availablePlans = json.available_plans;
                return availablePlans;
            },
            list: async function (proxy: any = null) {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${VULTR_API_KEY}`
                };
                const options: any = { method: 'GET', headers };
                if (proxy) {
                    options.client = Deno.createHttpClient({ proxy });
                }
                const res = await fetch(`${VULTR_BASE_URL}/regions`, options);
                const json: any = await res.json();
                const regions = json
                    .regions
                    .map((data: any) => data.id)
                    .filter(async(id: string) => {
                        const availablePlans = await compute.vultr.regions.availability(proxy, id);
                        return availablePlans.includes(compute.vultr.instanceSize);
                    });

                return regions;
            },
        },
        os: {
            getId: async function (instanceImage: string) {
                let results: any[] = [];
                let cursor = '';
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${VULTR_API_KEY}`
                };
                const options: any = { method: 'GET', headers };

                let canLoop = true;
                while (canLoop) {
                    let url = `${VULTR_BASE_URL}/os?per_page=50`;
                    if (cursor) {
                        url = `${url}&cursor=${cursor}`;
                    }

                    const res = await fetch(url, options);
                    const json: any = await res.json();

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
            create: async function (args: CreateVultrInstance) {
                const osId = await compute.vultr.os.getId(compute.vultr.instanceImage);
                args.os_id = osId;
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${VULTR_API_KEY}`
                };
                const res = await fetch(`${VULTR_BASE_URL}/instances`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(args),
                });
                const json: any = await res.json();
                if (!json.instance) logger.error('compute.vultr.instances.create error', json);
                const instanceIp = await compute.vultr.ip.get(json.instance.id);
                return {
                    instanceId: json.instance.id,
                    instanceIp,
                }
            },
            get: async function (instanceId: string) {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${VULTR_API_KEY}`
                };
                const res = await fetch(`${VULTR_BASE_URL}/instances/${instanceId}`, { method: 'GET', headers });
                const json: any = await res.json();
                return json.instance;
            },
            list: async function () {
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${VULTR_API_KEY}`
                };
                const res = await fetch(`${VULTR_BASE_URL}/instances`, { method: 'GET', headers });
                const json: any = await res.json();
                return json.instances;
            },
            delete: async function (ids: number[]) {
                let index = 0;

                while (index < ids.length) {
                    const id = ids[index];
                    const headers = {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${VULTR_API_KEY}`
                    };
                    await fetch(`${VULTR_BASE_URL}/instances/${id}`, {
                        method: 'DELETE',
                        headers,
                    });
                    logger.info(`Deleted Vultr instance: ${id}.`);
                    index = index + 1;
                }
            },
        },
        keys: {
            add: async function(publicKey: string, name: string) {
                const headers = {
                    Authorization: `Bearer ${VULTR_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const body = {
                    name: name,
                    'ssh_key': publicKey,
                };
                const res = await fetch(`${VULTR_BASE_URL}/ssh-keys`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                });
                const json: any = await res.json();
                return json['ssh_key']['id'];
            },
            list: async function () {
                const headers = {
                    Authorization: `Bearer ${VULTR_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const res = await fetch(`${VULTR_BASE_URL}/ssh-keys`, {
                    method: 'GET',
                    headers,
                });
                const json: any = await res.json();
                return json['ssh_keys'];
            },
            delete: async function (ids: number[]) {
                let index = 0;

                while (index < ids.length) {
                    const id = ids[index];
                    const headers = {
                        Authorization: `Bearer ${VULTR_API_KEY}`,
                        'Content-Type': 'application/json',
                    };
                    await fetch(`${VULTR_BASE_URL}/ssh-keys/${id}`, {
                        method: 'DELETE',
                        headers,
                    });
                    logger.info(`Deleted Vultr ssh_key: ${id}.`);
                    index = index + 1;
                }
            },
        },
        ip: {
            get: async function (instanceId: string) {
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
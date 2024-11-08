// deno-lint-ignore-file no-explicit-any

import jwt from 'npm:jsonwebtoken';
import * as lib from './lib.ts';
import { exists } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import { URLSearchParams } from 'node:url';
import { logger as _logger } from './logger.ts';

const logger = _logger.get();

import {
    SRC_PATH,
    KEY_ALGORITHM,
    KEY_LENGTH,
    KNOWN_HOSTS_PATH,
    GENERATE_SSH_KEY_FILE_NAME,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_KV_NAMESPACE,
    CLOUDFLARE_API_KEY,
    CLOUDFLARE_BASE_URL,
    INSTANCE_IMAGE,
    DIGITAL_OCEAN_API_KEY,
    DIGITAL_OCEAN_BASE_URL,
    CONTABO_BASE_URL,
    CONTABO_CLIENT_ID,
    CONTABO_CLIENT_SECRET,
    CONTABO_API_USER,
    CONTABO_API_PASSWORD,
} from './constants.ts';

import {
    Connection,
    CreateInstance,
} from './types.ts';

export const shell = {
	private_key: {
		create: async function (
            keyPath: string,
            instanceName: string,
            passphrase: string,
        ) {
            const cmd =
                `${SRC_PATH}/${GENERATE_SSH_KEY_FILE_NAME} ${passphrase} ${keyPath} ${KEY_ALGORITHM} ${KEY_LENGTH}`;
            // @ts-ignore: because
            const process = Deno.run({ cmd: cmd.split(' ') });
            await process.status();
            const publicKey = await Deno.readTextFile(`${keyPath}.pub`);
            const publicKeyId = await compute.digital_ocean.keys.add(publicKey, instanceName);
            return publicKeyId;
        }
    },
    pkill: async function (input: string) {
        const cmd = 'pkill';
        const args = `-f ${input}`.split(' ');
        const command = new Deno.Command(cmd, { args });
        await command.output();
    },
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
        regions: {
            list: async function (instanceSize: string, proxy: any = null) {
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
                    .filter((region: any) => region.sizes.includes(instanceSize))
                    .map((region: any) => region.slug)
                return regions;
            },
        },
        instances: {
            create: async function (args: CreateInstance) {
                const { region, name, size, publicKeyId, userData } = args;
                const headers = {
                    Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
                    'Content-Type': 'application/json',
                };
                const body = {
                    name,
                    region,
                    size,
                    image: INSTANCE_IMAGE,
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
            },
            list: async function () {
                const headers = {
                    Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
                };
                const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/droplets`, { method: 'GET', headers });
                const json: any = await res.json();
                return json;
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
                    logger.info(`Deleted droplet: ${id}.`);
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
                return json;
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
                    logger.info(`Deleted key: ${id}.`);
                    index = index + 1;
                }
            },
        },
        ips: {
            get: async function (dropletId: string) {
                let ip = null;

                while (!ip) {
                    const list = await compute.digital_ocean.instances.list();
                    const droplets = list.droplets;

                    if (list && droplets) {
                        const droplet = droplets.find((droplet: any) =>
                            droplet.id == dropletId
                        );

                        if (droplet && droplet.networks.v4.length) {
                            ip = droplet.networks.v4.filter((network: any) =>
                                network.type == 'public'
                            )[0]['ip_address'];
                        }
                    }
                }

                return ip;
            },
        },
    },
	contabo: {
        access_token: {
            get: async function () {
                const body = new URLSearchParams();
                body.set('client_id', CONTABO_CLIENT_ID);
                body.set('client_secret', CONTABO_CLIENT_SECRET);
                body.set('username', CONTABO_API_USER);
                body.set('password', CONTABO_API_PASSWORD);
                body.set('grant_type', 'password');
                const res = await fetch('https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token', {
                    method: 'POST',
                    body,
                });
                const json = await res.json();
                return json.access_token;
            },
        },
        regions: {
            list: async function (proxy: any = null) {
                const headers = {
                    Accept: 'application/json',
                    Authorization: `Bearer ${await compute.contabo.access_token.get()}`,
                    'x-request-id': '51A87ECD-754E-4104-9C54-D01AD0F83406',
                    'x-trace-id': '123213'
                };
                const options: any = { method: 'GET', headers };
                if (proxy) {
                    options.client = Deno.createHttpClient({ proxy });
                }
                const res = await fetch(`${CONTABO_BASE_URL}/data-centers?size=100`, options);
                const json: any = await res.json();
                const regions = json
                    .data
                    .filter((data: any) => data.capabilities.includes('VPS'))
                    .map((data: any) => data.slug);
                return regions;
            },
        },
    }
};
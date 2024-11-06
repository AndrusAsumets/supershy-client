// deno-lint-ignore-file no-explicit-any

import jwt from 'npm:jsonwebtoken';
import * as lib from './lib.ts';
import { exists } from 'https://deno.land/std@0.224.0/fs/mod.ts';

const logger = lib.logger.get();

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
            const publicKeyId = await compute.digital_ocean.addKey(publicKey, instanceName);
            return publicKeyId;
        }
    },
    pkill: async function (input: string) {
        const cmd = 'pkill';
        const args = `-f ${input}`.split(' ');
        const command = new Deno.Command(cmd, { args });
        await command.output();
    },
    ensureFolder: async function (path: string) {
        if (!await exists(path)) {
            await Deno.mkdir(path);
        }
    },
};

export const kv = {
    cloudflare: {
        getHostKey: async function (
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
        updateHostKey: async function (
            connection: Connection,
            jwtSecret: string,
        ) {
            const { connectionUuid, instanceIp } = connection;
        
            connection.hostKey = await kv.cloudflare.getHostKey(connection.connectionUuid, jwtSecret);
            logger.info(`Fetched host key for connection ${connectionUuid}.`);
        
            Deno.writeTextFileSync(
                KNOWN_HOSTS_PATH,
                `${instanceIp} ssh-${KEY_ALGORITHM} ${connection.hostKey}\n`,
                { append: true },
            );
            logger.info(`Added host key for ${instanceIp} to known hosts.`);
        
            return connection;
        },
    },
};

export const compute = {
	digital_ocean: {
		listRegions: async function () {
            const headers = {
                Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
            };
            const options: any = { method: 'GET', headers };
            const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/regions`, options);
            const json: any = await res.json();
            return json.regions;
		},
        createDroplet: async function (args: CreateInstance) {
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
        listDroplets: async function () {
            const headers = {
                Authorization: `Bearer ${DIGITAL_OCEAN_API_KEY}`,
            };
            const res = await fetch(`${DIGITAL_OCEAN_BASE_URL}/droplets`, { method: 'GET', headers });
            const json: any = await res.json();
            return json;
        },
        deleteDroplets: async function (ids: number[]) {
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

        addKey: async function(publicKey: string, name: string) {
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
        listKeys: async function () {
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
        deleteKeys: async function (ids: number[]) {
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
        getDropletIp: async function (dropletId: string) {
            let ip = null;
        
            while (!ip) {
                const list = await compute.digital_ocean.listDroplets();
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
        
            logger.info(`Found network at ${ip}.`);
        
            return ip;
        },
    },
};
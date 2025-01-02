// deno-lint-ignore-file no-explicit-any

import * as core from '../../core.ts';
import * as models from '../../models.ts';
import { logger as _logger } from '../../logger.ts';
import { CreateHetznerInstance } from '../../types.ts';

const logger = _logger.get();
const { config } = models;

export const hetzner = {
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
            const serverTypeId = await hetzner.serverTypes.getId(hetzner.instanceSize);
            json.error && logger.error({ message: 'hetzner.regions.all error', json });
            const regions = json
                .datacenters
                .filter((data: any) => data.server_types.available.includes(serverTypeId));
            return regions;
        },
        parse: async () => {
            const regions = await hetzner.regions.all();
            return regions
                .filter((data: any) =>
                    !config().INSTANCE_COUNTRIES_DISABLED.includes(data.location.country)
                )
                .map((data: any) => [data.name, data.location.country]);
        },
    },
    countries: {
        list: async () => {
            const regions = await hetzner.regions.all();
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
            !serverTypes && logger.error({ message: 'hetzner.serverTypes.getId error', json });

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
            !json.server && logger.error({ message: 'hetzner.instances.create error', json });
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
};
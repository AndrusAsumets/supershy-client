// deno-lint-ignore-file no-explicit-any

import * as core from '../../core.ts';
import * as models from '../../models.ts';
import { logger as _logger } from '../../logger.ts';
import { Node, CreateHetznerInstance } from '../../types.ts';

const logger = _logger.get();
const { config } = models;

export const hetzner = {
    instanceApiBaseUrl: 'https://api.hetzner.cloud/v1',
    instanceSize: config().HETZNER_SERVER_TYPE,
    getInstanceImage: async () => config().HETZNER_INSTANCE_IMAGE,
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
            const res = await fetch(`${hetzner.instanceApiBaseUrl}/datacenters`, core.useProxy(options));
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
                .map((data: any) => [
                    data.name,
                    data.location.country,
                    hetzner.instanceApiBaseUrl
                ]);
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
            const res = await fetch(`${hetzner.instanceApiBaseUrl}/server_types?per_page=50`, core.useProxy(options));
            const json = await res.json();
            const serverTypes = json.server_types;
            !serverTypes && logger.error({ message: 'hetzner.serverTypes.getId error', json });

            const serverTypeId = serverTypes
                .filter((serverType: any) => serverType.name === instanceSize)[0].id;
            return serverTypeId;
        },
    },
    keys: {
        add: async (
            node: Node,
            publicKey: string,
            name: string,
        ): Promise<string> => {
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
            const res = await fetch(`${node.instanceApiBaseUrl}/ssh_keys`, core.useProxy(options));
            const json = await res.json();
            !json['ssh_key'] && logger.error({ message: 'hetzner.keys.add error', json });
            return json['ssh_key']['id'];
        },
        list: async (): Promise<any[][]> => {
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config().HETZNER_API_KEY}`
            };
            const options = { method: 'GET', headers };
            const res = await fetch(`${hetzner.instanceApiBaseUrl}/ssh_keys`, core.useProxy(options));
            const json = await res.json();
            return [[json['ssh_keys'], hetzner.instanceApiBaseUrl]];
        },
        delete: async (ids: string[], instanceApiBaseUrl: string) => {
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
                await fetch(`${instanceApiBaseUrl}/ssh_keys/${id}`, core.useProxy(options));
                logger.info(`Deleted Hetzner key: ${id}.`);
                index = index + 1;
            }
        },
    },
    instances: {
        create: async (node: Node, args: CreateHetznerInstance) => {
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config().HETZNER_API_KEY}`
            };
            const options = {
                method: 'POST',
                headers,
                body: JSON.stringify(args),
            };
            const res = await fetch(`${node.instanceApiBaseUrl}/servers`, core.useProxy(options));
            const json = await res.json();
            !json.server && logger.error({ message: 'hetzner.instances.create error', json });
            return {
                instanceId: String(json.server.id),
                instanceIp: json.server.public_net.ipv4.ip,
            }
        },
        list: async (): Promise<any[][]> => {
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config().HETZNER_API_KEY}`
            };
            const options = { method: 'GET', headers };
            const res = await fetch(`${hetzner.instanceApiBaseUrl}/servers`, core.useProxy(options));
            const json = await res.json();
            return [[json.servers, hetzner.instanceApiBaseUrl]];
        },
        delete: async (ids: string[], instanceApiBaseUrl: string) => {
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
                await fetch(`${instanceApiBaseUrl}/servers/${id}`, core.useProxy(options));
                logger.info(`Deleted Hetzner instance: ${id}.`);
                index = index + 1;
            }
        },
    },
};
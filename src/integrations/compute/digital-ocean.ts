// deno-lint-ignore-file no-explicit-any

import * as core from '../../core.ts';
import * as models from '../../models.ts';
import { logger as _logger } from '../../logger.ts';
import { Node, CreateDigitalOceanInstance } from '../../types.ts';

const logger = _logger.get();
const { config } = models;

const instanceRegions: Record<string, string> = {
    nyc: 'US',
    ams: 'NL',
    sfo: 'US',
    sgp: 'SG',
    lon: 'UK',
    fra: 'DE',
    tor: 'CA',
    blr: 'IN',
    syd: 'AU',
};

export const digitalOcean = {
    instanceApiBaseUrl: 'https://api.digitalocean.com/v2',
    instanceRegions,
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
            const res = await fetch(`${digitalOcean.instanceApiBaseUrl}/regions`, core.useProxy(options));
            const json = await res.json();
            const regions = json.regions;
            !regions && logger.error({ message: 'digitalOcean.regions.list error', json });

            return regions
                .filter((region: any) => region.sizes.includes(digitalOcean.instanceSize))
                .map((region: any) => region.slug);
        },
        parse: async () => {
            const regions = await digitalOcean.regions.all();
            return regions
                .filter((region: string) =>
                    !config().INSTANCE_COUNTRIES_DISABLED.includes(
                        digitalOcean.instanceRegions[region.replace(/[0-9]/g, '')]
                    )
                ).map((region: string) => [
                    region,
                    digitalOcean.instanceRegions[region.replace(/[0-9]/g, '')],
                    digitalOcean.instanceApiBaseUrl
                ]);
        },
    },
    countries: {
        list: async () => {
            const regions = await digitalOcean.regions.all();
            return regions
                .map((region: string) => digitalOcean.instanceRegions[region.replace(/[0-9]/g, '')]);
        },
    },
    keys: {
        add: async (
            node: Node,
            publicKey: string,
            name: string,
        ): Promise<string> => {
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
            const res = await fetch(`${node.instanceApiBaseUrl}/account/keys`, core.useProxy(options));
            const json = await res.json();
            !json['ssh_key'] && logger.error({ message: 'digitalOcean.keys.add error', json });
            return json['ssh_key']['id'];
        },
        delete: async (node: Node, instancePublicKeyId: string) => {
            const headers = {
                Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
                'Content-Type': 'application/json',
            };
            const options = {
                method: 'DELETE',
                headers,
            };
            await fetch(`${node.instanceApiBaseUrl}/account/keys/${instancePublicKeyId}`, core.useProxy(options));
            logger.info(`Deleted digital ocean ssh_key: ${instancePublicKeyId}.`);
        },
    },
    instances: {
        create: async (node: Node, args: CreateDigitalOceanInstance) => {
            const headers = {
                Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
                'Content-Type': 'application/json',
            };
            const options = {
                method: 'POST',
                headers,
                body: JSON.stringify(args),
            };
            const res = await fetch(`${node.instanceApiBaseUrl}/droplets`, core.useProxy(options));
            const json = await res.json();
            !json.droplet && logger.error({ message: 'digitalOcean.instances.create error', json });
            const instanceIp = await digitalOcean.ip.get(node, json.droplet.id);
            return {
                instanceId: String(json.droplet.id),
                instanceIp,
            };
        },
        get: async (node: Node, dropletId: string) => {
            const headers = {
                Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
            };
            const options = { method: 'GET', headers };
            const res = await fetch(`${node.instanceApiBaseUrl}/droplets/${dropletId}`, core.useProxy(options));
            const json = await res.json();
            return json.droplet;
        },
        list: async (): Promise<any[][]> => {
            const headers = {
                Authorization: `Bearer ${config().DIGITAL_OCEAN_API_KEY}`,
            };
            const options = { method: 'GET', headers };
            const res = await fetch(`${digitalOcean.instanceApiBaseUrl}/droplets`, core.useProxy(options));
            const json = await res.json();
            return [[json.droplets, digitalOcean.instanceApiBaseUrl]];
        },
        delete: async (ids: string[], instanceApiBaseUrl: string) => {
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
                await fetch(`${instanceApiBaseUrl}/droplets/${id}`, core.useProxy(options));
                logger.info(`Deleted digital ocean instance: ${id}.`);
                index = index + 1;
            }
        },
    },
    ip: {
        get: async (node: Node, dropletId: string) => {
            let ip = null;

            while (!ip) {
                const droplet = await digitalOcean.instances.get(node, dropletId);
                if (droplet && droplet.networks.v4.length) {
                    ip = droplet.networks.v4.filter((network: any) =>
                        network.type == 'public'
                    )[0]['ip_address'];
                }
            }

            return ip;
        },
    },
};
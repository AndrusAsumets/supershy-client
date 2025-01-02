// deno-lint-ignore-file no-explicit-any

import * as core from '../../core.ts';
import * as models from '../../models.ts';
import { logger as _logger } from '../../logger.ts';
import { CreateDigitalOceanInstance } from '../../types.ts';

const logger = _logger.get();
const { config } = models;

export const digital_ocean = {
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
            !regions && logger.error({ message: 'digital_ocean.regions.list error', json });

            return regions
                .filter((region: any) => region.sizes.includes(digital_ocean.instanceSize))
                .map((region: any) => region.slug);
        },
        parse: async () => {
            const regions = await digital_ocean.regions.all();
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
            const regions = await digital_ocean.regions.all();
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
            !json.droplet && logger.error({ message: 'digital_ocean.instances.create error', json });
            const instanceIp = await digital_ocean.ip.get(json.droplet.id);
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
            !json['ssh_key'] && logger.error({message: 'digital__ocean.keys.add error', json });
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
                const droplet = await digital_ocean.instances.get(dropletId);
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
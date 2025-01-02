// deno-lint-ignore-file no-explicit-any

import { encodeBase64 } from 'jsr:@std/encoding/base64';
import * as core from '../../core.ts';
import * as models from '../../models.ts';
import { logger as _logger } from '../../logger.ts';
import { CreateVultrInstance } from '../../types.ts';

const logger = _logger.get();
const { config } = models;

export const vultr = {
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
            const regions = await vultr.regions.all();
            return regions
                .filter((data: any) =>
                    !config().INSTANCE_COUNTRIES_DISABLED.includes(data.country)
                )
                .filter(async(data: any) => {
                    const availablePlans = await vultr.regions.availability(data.id);
                    return availablePlans.includes(vultr.instanceSize);
                })
                .map((data: any) => [data.id, data.country]);
        },
    },
    countries: {
        list: async () => {
            const regions = await vultr.regions.all();
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
            const osId = await vultr.os.getId(vultr.instanceImage);
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
            !json.instance && logger.error({ message: 'vultr.instances.create error', json });
            const instanceIp = await vultr.ip.get(json.instance.id);
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
            !json['ssh_key'] && logger.error({ message: 'vultr.keys.add error', json });
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
                const instance = await vultr.instances.get(instanceId);

                if (instance && instance.main_ip !== '0.0.0.0') {
                    ip = instance.main_ip;
                }
            }

            return ip;
        },
    },
};
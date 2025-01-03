// deno-lint-ignore-file no-explicit-any

import { encodeBase64 } from 'jsr:@std/encoding/base64';
import * as core from '../../core.ts';
import * as models from '../../models.ts';
import { logger as _logger } from '../../logger.ts';
import { Node, CreateVultrInstance } from '../../types.ts';

const logger = _logger.get();
const { config } = models;

export const vultr = {
    instanceApiBaseUrl: 'https://api.vultr.com/v2',
    instanceSize: config().VULTR_INSTANCE_PLAN,
    instanceImage: config().VULTR_INSTANCE_IMAGE,
    userData: {
        format: (userData: string) => {
            return encodeBase64(userData);
        }
    },
    regions: {
        availability: async (node: Node, regionId: string) => {
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config().VULTR_API_KEY}`
            };
            const options = { method: 'GET', headers };
            const res = await fetch(`${node.instanceApiBaseUrl}/regions/${regionId}/availability`, core.useProxy(options));
            const json = await res.json();
            const availablePlans = json.available_plans;
            return availablePlans;
        },
        all: async (node: Node) => {
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config().VULTR_API_KEY}`
            };
            const options = { method: 'GET', headers };
            const res = await fetch(`${node.instanceApiBaseUrl}/regions`, core.useProxy(options));
            const json = await res.json();
            return json.regions;
        },
        parse: async (node: Node) => {
            const regions = await vultr.regions.all(node);
            return regions
                .filter((data: any) =>
                    !config().INSTANCE_COUNTRIES_DISABLED.includes(data.country)
                )
                .filter(async(data: any) => {
                    const availablePlans = await vultr.regions.availability(node, data.id);
                    return availablePlans.includes(vultr.instanceSize);
                })
                .map((data: any) => [data.id, data.country]);
        },
    },
    countries: {
        list: async (node: Node) => {
            const regions = await vultr.regions.all(node);
            return regions
                .map((data: any) => data.country);
        },
    },
    os: {
        getId: async (node: Node, instanceImage: string) => {
            let results: any[] = [];
            let cursor = '';
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config().VULTR_API_KEY}`
            };
            const options = { method: 'GET', headers };

            let canLoop = true;
            while (canLoop) {
                let url = `${node.instanceApiBaseUrl}/os?per_page=50`;
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
        create: async (node: Node, args: CreateVultrInstance) => {
            const osId = await vultr.os.getId(node, vultr.instanceImage);
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
            const res = await fetch(`${node.instanceApiBaseUrl}/instances`, core.useProxy(options));
            const json = await res.json();
            !json.instance && logger.error({ message: 'vultr.instances.create error', json });
            const instanceIp = await vultr.ip.get(node, json.instance.id);
            return {
                instanceId: String(json.instance.id),
                instanceIp,
            }
        },
        get: async (node: Node, instanceId: string) => {
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config().VULTR_API_KEY}`
            };
            const options = { method: 'GET', headers };
            const res = await fetch(`${node.instanceApiBaseUrl}/instances/${instanceId}`, core.useProxy(options));
            const json = await res.json();
            return json.instance;
        },
        list: async (): Promise<any[][]> => {
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config().VULTR_API_KEY}`
            };
            const options = { method: 'GET', headers };
            const res = await fetch(`${vultr.instanceApiBaseUrl}/instances`, core.useProxy(options));
            const json = await res.json();
            return [[json.instances, vultr.instanceApiBaseUrl]];
        },
        delete: async (ids: number[], instanceApiBaseUrl: string) => {
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
                await fetch(`${instanceApiBaseUrl}/instances/${id}`, core.useProxy(options));
                logger.info(`Deleted Vultr instance: ${id}.`);
                index = index + 1;
            }
        },
    },
    keys: {
        add: async (
            node: Node,
            publicKey: string,
            name: string,
        ): Promise<string> => {
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
            const res = await fetch(`${node.instanceApiBaseUrl}/ssh-keys`, core.useProxy(options));
            const json = await res.json();
            !json['ssh_key'] && logger.error({ message: 'vultr.keys.add error', json });
            return String(json['ssh_key']['id']);
        },
        delete: async (node: Node, instancePublicKeyId: string) => {
            const headers = {
                Authorization: `Bearer ${config().VULTR_API_KEY}`,
                'Content-Type': 'application/json',
            };
            const options = {
                method: 'DELETE',
                headers,
            };
            await fetch(`${node.instanceApiBaseUrl}/ssh-keys/${instancePublicKeyId}`, core.useProxy(options));
            logger.info(`Deleted Vultr ssh_key: ${instancePublicKeyId}.`);
        },
    },
    ip: {
        get: async (node: Node, instanceId: string) => {
            let ip = null;

            while (!ip) {
                const instance = await vultr.instances.get(node, instanceId);

                if (instance && instance.main_ip !== '0.0.0.0') {
                    ip = instance.main_ip;
                }
            }

            return ip;
        },
    },
};
// deno-lint-ignore-file no-explicit-any

import { Buffer } from 'node:buffer';
import * as core from '../../core.ts';
import * as lib from '../../lib.ts';
import * as models from '../../models.ts';
import { logger as _logger } from '../../logger.ts';
import { Node, InstancePayload, CreateUpcloudInstance } from '../../types.ts';

const logger = _logger.get();
const { config } = models;

export const upcloud = {
    instanceApiBaseUrl: 'https://api.upcloud.com/1.3',
    instanceSize: config().UPCLOUD_SERVER_TYPE,
    instanceImage: config().UPCLOUD_INSTANCE_IMAGE,
    userData: {
        format: (userData: string) => {
            return userData;
        }
    },
    regions: {
        all: async () => {
            const basic = new Buffer(`${config().UPCLOUD_API_KEY}:${config().UPCLOUD_API_SECRET}`).toString('base64');
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Basic ${basic}`
            };
            const options = { method: 'GET', headers };
            const res = await fetch(`${upcloud.instanceApiBaseUrl}/zone`, core.useProxy(options));
            const json = await res.json();
            json.error && logger.error({ message: 'upcloud.regions.all error', json });
            const regions = json
                .zones.zone;
            return regions;
        },
        parse: async () => {
            const regions = await upcloud.regions.all();
            return regions
                .filter((data: any) =>
                    !config().INSTANCE_COUNTRIES_DISABLED.includes(data.id.split('-')[0].toUpperCase())
                )
                .map((data: any) => [
                    data.id,
                    data.id.split('-')[0].toUpperCase(),
                    upcloud.instanceApiBaseUrl
                ]);
        },
    },
    countries: {
        list: async () => {
            const regions = await upcloud.regions.all();
            return regions
                .map((data: any) => data.id.split('-')[0].toUpperCase());
        },
    },
    keys: {
        add: async (
            _: Node,
            publicKey: string,
            __: string,
        ): Promise<string> => {
            return publicKey;
        },
        list: async (): Promise<any[][]> => {
            return [];
        },
        delete: async (_: string[], __: string) => {},
    },
    instances: {
        create: async (node: Node, args: InstancePayload) => {
            const payload: CreateUpcloudInstance = {
                title: args.title,
                zone: args.zone,
                login_user: args.login_user,
                firewall: args.firewall,
                hostname: args.hostname,
                metadata: args.metadata,
                networking: args.networking,
                plan: args.plan,
                simple_backup: args.simple_backup,
                storage_devices: args.storage_devices,
                user_data: args.user_data,
            };
            const basic = new Buffer(`${config().UPCLOUD_API_KEY}:${config().UPCLOUD_API_SECRET}`).toString('base64');
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Basic ${basic}`
            };
            const options = {
                method: 'POST',
                headers,
                body: JSON.stringify({ server: payload }),
            };
            const res = await fetch(`${node.instanceApiBaseUrl}/server`, core.useProxy(options));
            const json = await res.json();
            !json.server && logger.error({ message: 'upcloud.instances.create error', json });
            return {
                instanceId: String(json.server.uuid),
                instanceIp: json.server.ip_addresses.ip_address.filter((ipAddress: any) => ipAddress.access == 'public')[0].address,
            }
        },
        list: async (): Promise<any[][]> => {
            const basic = new Buffer(`${config().UPCLOUD_API_KEY}:${config().UPCLOUD_API_SECRET}`).toString('base64');
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Basic ${basic}`
            };
            const options = { method: 'GET', headers };
            const res = await fetch(`${upcloud.instanceApiBaseUrl}/server`, core.useProxy(options));
            const json = await res.json();
            return [[json.servers.server, upcloud.instanceApiBaseUrl]];
        },
        stop: async (id: string) => {
            const payload = {
                stop_server: {
                    stop_type: 'hard',
                    timeout: '1'
                }
            };
            const basic = new Buffer(`${config().UPCLOUD_API_KEY}:${config().UPCLOUD_API_SECRET}`).toString('base64');
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Basic ${basic}`
            };
            const options = {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            };
            await fetch(`${upcloud.instanceApiBaseUrl}/server/${id}/stop`, core.useProxy(options));
            await lib.sleep(config().UPCLOUD_DELETE_DELAY_SEC * 1000);
        },
        delete: async (ids: string[], instanceApiBaseUrl: string) => {
            let index = 0;
            while (index < ids.length) {
                const id = ids[index];
                await upcloud.instances.stop(id);
                const basic = new Buffer(`${config().UPCLOUD_API_KEY}:${config().UPCLOUD_API_SECRET}`).toString('base64');
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${basic}`
                };
                const options = {
                    method: 'DELETE',
                    headers,
                };
                await fetch(`${instanceApiBaseUrl}/server/${id}?storages=true&backups=delete`, core.useProxy(options));
                logger.info(`Deleted Upcloud instance: ${id}.`);
                index = index + 1;
            }
        },
    }
};
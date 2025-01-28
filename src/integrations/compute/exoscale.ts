// deno-lint-ignore-file no-explicit-any

import * as crypto from 'node:crypto';
import { encodeBase64 } from 'jsr:@std/encoding/base64';
import * as core from '../../core.ts';
import * as models from '../../models.ts';
import { logger as _logger } from '../../logger.ts';
import { Node, CreateExoscaleInstance } from '../../types.ts';

const logger = _logger.get();
const { config } = models;

export const exoscale = {
    instanceApiBaseUrl: 'https://api-[API_BASE_URL].exoscale.com/v2',
    instanceZones: [
        'ch-gva-2',
        'ch-dk-2',
        'de-fra-1',
        'de-muc-1',
        'at-vie-1',
        'at-vie-2',
        'bg-sof-1',
    ],
    instanceSize: '',
    instanceImage: '',
    sign: (
        requestType: string,
        requestPath: string,
        requestBody: any = '',
    ) => {
        const expirationEpoch = Math.floor(new Date().getTime() / 1000) + config().EXOSCALE_REQUEST_EXPIRATION_SEC;
        const message = `${requestType} /v2${requestPath}\n${requestBody}\n\n\n${expirationEpoch}`;
        const signature = crypto.createHmac('sha256', config().EXOSCALE_API_SECRET).update(message).digest('base64');
        const authorization = `EXO2-HMAC-SHA256 credential=${config().EXOSCALE_API_KEY},expires=${expirationEpoch},signature=${signature}`;
        return authorization;
    },
    userData: {
        format: (userData: string) => {
            return encodeBase64(userData);
        }
    },
    regions: {
        parse: () => {
            return exoscale.instanceZones
                .filter((zone: string) =>
                    !config().INSTANCE_COUNTRIES_DISABLED.includes(
                        zone.split('-')[0].toUpperCase()
                    )
                )
                .map((zone: string) => [
                    zone,
                    zone.split('-')[0].toUpperCase(),
                    exoscale.instanceApiBaseUrl.replace('[API_BASE_URL]', zone)
                ]);
        },
    },
    countries: {
        list: () => {
            return exoscale.instanceZones
                .map((zone => zone.split('-')[0].toUpperCase()));
        },
    },
    keys: {
        add: async (
            node: Node,
            publicKey: string,
            name: string,
        ) => {
            const requestType = 'POST';
            const requestPath = '/ssh-key';
            const requestBody = JSON.stringify({
                name,
                'public-key': publicKey,
            });
            const headers = {
                'Authorization': exoscale.sign(requestType, requestPath, requestBody),
                'Content-Type': 'application/json',
            };
            const options = {
                method: requestType,
                headers,
                body: requestBody,
            };
            const res = await fetch(`${node.instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
            const json = await res.json();
            !json['id'] && logger.error({ message: 'exoscale.keys.add error', json });
            return name;
        },
        list: async (): Promise<any[][]> => {
            const keysList = [];

            let index = 0;
            while (index < exoscale.instanceZones.length) {
                const zone = exoscale.instanceZones[index];
                const instanceApiBaseUrl = exoscale.instanceApiBaseUrl.replace('[API_BASE_URL]', zone);
                const requestType = 'GET';
                const requestPath = '/ssh-key';
                const headers = {
                    'Authorization': exoscale.sign(requestType, requestPath),
                    'Content-Type': 'application/json',
                };
                const options = {
                    method: requestType,
                    headers,
                };
                const res = await fetch(`${instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
                const json = await res.json();
                keysList.push([json['ssh-keys'], instanceApiBaseUrl]);
                index = index + 1;
            }

            return keysList;
        },
        delete: async (ids: string[], instanceApiBaseUrl: string) => {
            let index = 0;
            while (index < ids.length) {
                const id = ids[index];
                const requestType = 'DELETE';
                const requestPath = `/ssh-key/${id}`;
                const headers = {
                    'Authorization': exoscale.sign(requestType, requestPath),
                    'Content-Type': 'application/json',
                };
                const options = {
                    method: requestType,
                    headers,
                };
                const res = await fetch(`${instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
                const json = await res.json();
                json.id && logger.info(`Deleted Exoscale key: ${id}.`);
                index = index + 1;
            }
        },
    },
    instanceType: {
        list: async (node: Node) => {
            const requestType = 'GET';
            const requestPath = '/instance-type';
            const headers = {
                'Authorization': exoscale.sign(requestType, requestPath),
                'Content-Type': 'application/json',
            };
            const options = {
                method: requestType,
                headers,
            };
            const res = await fetch(`${node.instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
            const json = await res.json();
            return json['instance-types'];
        },
    },
    securityGroup: {
        create: async (node: Node) => {
            const requestType = 'POST';
            const requestPath = '/security-group';
            const requestBody = JSON.stringify({ name: node.instanceName });
            const headers = {
                'Authorization': exoscale.sign(requestType, requestPath, requestBody),
                'Content-Type': 'application/json',
            };
            const options = {
                method: requestType,
                headers,
                body: requestBody,
            };
            const res = await fetch(`${node.instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
            const json = await res.json();
            !json.id && logger.error({ message: 'exoscale.securityGroup.create error', json });
            return json.reference.id;
        },
        rules: {
            create: async (node: Node, securityGroupId: string, protocol: string) => {
                const requestType = 'POST';
                const requestPath = `/security-group/${securityGroupId}/rules`;
                const requestBody = JSON.stringify({
                    'flow-direction': 'ingress',
                    network: '0.0.0.0/0',
                    protocol,
                    'start-port': node.tunnelPort,
                    'end-port': node.tunnelPort,
                });
                const headers = {
                    'Authorization': exoscale.sign(requestType, requestPath, requestBody),
                    'Content-Type': 'application/json',
                };
                const options = {
                    method: requestType,
                    headers,
                    body: requestBody,
                };
                const res = await fetch(`${node.instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
                const json = await res.json();
                !json['id'] && logger.error({ message: 'exoscale.securityGroup.rules.create error', json });
            },
        }
    },
    globalTemplate: {
        list: async (node: Node) => {
            const requestType = 'GET';
            const requestPath = '/global-template';
            const headers = {
                'Authorization': exoscale.sign(requestType, requestPath),
                'Content-Type': 'application/json',
            };
            const options = {
                method: requestType,
                headers,
            };
            const res = await fetch(`${node.instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
            const json = await res.json();
            !json.templates && logger.error({ message: 'exoscale.global-template.list error', json });
            return json.templates;
        },
    },
    template: {
        create: async (node: Node, template: unknown) => {
            const requestType = 'POST';
            const requestPath = '/template';
            const requestBody = JSON.stringify(template);
            const headers = {
                'Authorization': exoscale.sign(requestType, requestPath, requestBody),
                'Content-Type': 'application/json',
            };
            const options = {
                method: requestType,
                headers,
                body: requestBody,
            };
            const res = await fetch(`${node.instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
            const json = await res.json();
            !json.id && logger.error({ message: 'exoscale.securityGroup.create error', json });
            return json.id;
        },
    },
    instances: {
        create: async (node: Node, instance: CreateExoscaleInstance) => {
            const instanceTypes = await exoscale.instanceType.list(node);
            instance['instance-type'].id = instanceTypes.filter((instanceType: any) => instanceType.size == config().EXOSCALE_INSTANCE_SIZE)[0].id;
            const securityGroupId = await exoscale.securityGroup.create(node);
            await exoscale.securityGroup.rules.create(node, securityGroupId, 'tcp');
            await exoscale.securityGroup.rules.create(node, securityGroupId, 'udp');
            instance['security-groups'].push({ id: securityGroupId });

            const templates = await exoscale.globalTemplate.list(node);
            instance.template = templates.filter((template: any) => template.name == config().EXOSCALE_TEMPLATE_NAME)[0];

            const requestType = 'POST';
            const requestPath = '/instance';
            const requestBody = JSON.stringify(instance);
            const headers = {
                'Authorization': exoscale.sign(requestType, requestPath, requestBody),
                'Content-Type': 'application/json',
            };
            const options = {
                method: requestType,
                headers,
                body: requestBody,
            };
            const res = await fetch(`${node.instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
            const json = await res.json();
            !json.id && logger.error({ message: 'exoscale.instances.create error', json });

            const instanceIp = await exoscale.ip.get(node, json.reference.id);
            return {
                instanceId: json.reference.id,
                instanceIp,
            };
        },
        get: async (node: Node, id: string) => {
            const requestType = 'GET';
            const requestPath = `/instance/${id}`;
            const headers = {
                'Authorization': exoscale.sign(requestType, requestPath),
                'Content-Type': 'application/json',
            };
            const options = {
                method: requestType,
                headers,
            };
            const res = await fetch(`${node.instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
            const json = await res.json();
            !json.id && logger.error({ message: 'exoscale.instances.get error', json });
            return json;
        },
        list: async () => {
            const instancesList = [];

            let index = 0;
            while (index < exoscale.instanceZones.length) {
                const zone = exoscale.instanceZones[index];
                const instanceApiBaseUrl = exoscale.instanceApiBaseUrl.replace('[API_BASE_URL]', zone);
                const requestType = 'GET';
                const requestPath = '/instance';
                const headers = {
                    'Authorization': exoscale.sign(requestType, requestPath),
                    'Content-Type': 'application/json',
                };
                const options = {
                    method: requestType,
                    headers,
                };
                const res = await fetch(`${instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
                const json = await res.json();
                instancesList.push([json.instances, instanceApiBaseUrl]);
                index = index + 1;
            }

            return instancesList;
        },
        delete: async (ids: string[], instanceApiBaseUrl: string) => {
            let index = 0;
            while (index < ids.length) {
                const id = ids[index];
                const requestType = 'DELETE';
                const requestPath = `/instance/${id}`;
                const headers = {
                    'Authorization': exoscale.sign(requestType, requestPath),
                    'Content-Type': 'application/json',
                };
                const options = {
                    method: requestType,
                    headers,
                };
                const res = await fetch(`${instanceApiBaseUrl}${requestPath}`, core.useProxy(options));
                const json = await res.json();
                !json.id && logger.error({ message: 'exoscale.instances.delete error', json });
                json.id && logger.info(`Deleted Exoscale instance: ${id}.`);
                index = index + 1;
            }
        },
    },
    ip: {
        get: async (node: Node, id: string) => {
            let ip = null;

            while (!ip) {
                const instance = await exoscale.instances.get(node, id);
                if (instance['public-ip']) {
                    ip = instance['public-ip'];
                }
            }

            return ip;
        },
    },
};
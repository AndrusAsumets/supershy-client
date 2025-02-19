import jwt from 'npm:jsonwebtoken';
import * as core from '../core.ts';
import * as lib from '../lib.ts';
import * as models from '../models.ts';
import { logger as _logger } from '../logger.ts';
import { Node } from '../types.ts';

const logger = _logger.get();
const { config } = models;

export const kv = {
    cloudflare: {
        apiBaseurl: 'https://api.cloudflare.com/client/v4',
        key: {
            read: async (
                node: Node,
                jwtSecret: string,
            ): Promise<string> => {
                logger.info(`Fetching ${node.connectionType} public key.`);
                let key = '';

                while (!key) {
                    try {
                        const headers = {
                            Authorization: `Bearer ${config().CLOUDFLARE_API_KEY}`,
                        };
                        const options = { method: 'GET', headers };
                        const url =
                            `${kv.cloudflare.apiBaseurl}/accounts/${config().CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${config().CLOUDFLARE_KV_NAMESPACE}/values/${node.nodeUuid}-${node.connectionType}`;
                        const res = await fetch(url, core.useProxy(options));
                        const text = await res.text();
                        text.includes('errors') && !text.includes('key not found') && logger.error({ message: `kv.cloudflare.hostKey.get error for ${node.connectionType}`, text });
                        key = jwt.verify(text, jwtSecret).key;
                        logger.info(`Fetched ${node.connectionType} public key.`);
                    } catch (_) {
                        await lib.sleep(1000);
                    }
                }

                return key;
            },
            write: (node: Node) => {
                Deno.writeTextFileSync(
                    config().SSH_KNOWN_HOSTS_PATH,
                    `${node.instanceIp} ssh-${config().SSH_KEY_ALGORITHM} ${node.serverPublicKey}\n`,
                    { append: true },
                );
            }
        },
    },
};
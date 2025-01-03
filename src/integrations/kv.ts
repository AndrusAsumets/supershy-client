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
        heartbeat: async (): Promise<boolean> => {
            try {
                const options = {
                    method: 'GET',
                    signal: AbortSignal.timeout(config().HEARTBEAT_INTERVAL_SEC),
                };
                const res = await fetch(kv.cloudflare.apiBaseurl, core.useProxy(options));
                await res.json();
                logger.info('Heartbeat.');
                return true;
            }
            catch(_) {
                return false;
            }
        },
        hostKey: {
            read: async (
                node: Node,
                jwtSecret: string,
            ) => {
                logger.info(`Fetching host key for node ${node.nodeUuid}.`);

                while (!node.sshHostKey) {
                    try {
                        const headers = {
                            Authorization: `Bearer ${config().CLOUDFLARE_API_KEY}`,
                        };
                        const options = { method: 'GET', headers };
                        const url =
                            `${kv.cloudflare.apiBaseurl}/accounts/${config().CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${config().CLOUDFLARE_KV_NAMESPACE}/values/${node.nodeUuid}`;
                        const res = await fetch(url, core.useProxy(options));
                        const text = await res.text();
                        text.includes('errors') && !text.includes('key not found') && logger.error({ message: 'kv.cloudflare.hostKey.get error', text });
                        const decoded = jwt.verify(text, jwtSecret);
                        node.sshHostKey = decoded.sshHostKey;
                        logger.info(`Fetched host key for node ${node.nodeUuid}.`);
                    } catch (_) {
                        await lib.sleep(1000);
                    }
                }

                return node;
            },
            write: (node: Node) => {
                const isFoundFromKnownHostsFile = Deno
                    .readTextFileSync(config().SSH_KNOWN_HOSTS_PATH)
                    .includes(node.sshHostKey);
    
                !isFoundFromKnownHostsFile && Deno.writeTextFileSync(
                    config().SSH_KNOWN_HOSTS_PATH,
                    `${node.instanceIp} ssh-${config().SSH_KEY_ALGORITHM} ${node.sshHostKey}\n`,
                    { append: true },
                );
            },
        },
    },
};
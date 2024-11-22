import * as path from 'https://deno.land/std@0.224.0/path/mod.ts';
import { homedir } from 'node:os';

import { InstanceProvider, ConnectionType } from './types.ts';

export const APP_ID = Deno.env.get('APP_ID')
    ? String(Deno.env.get('APP_ID'))
    : 'supershy-client';
export const ENV = Deno.env.get('ENV')
    ? String(Deno.env.get('ENV'))
    : 'dev';
export const LOOP_INTERVAL_SEC = Deno.env.get('LOOP_INTERVAL_SEC')
    ? Number(Deno.env.get('LOOP_INTERVAL_SEC'))
    : 1800;
export const TUNNEL_CONNECT_TIMEOUT_SEC = Deno.env.get('TUNNEL_CONNECT_TIMEOUT_SEC')
    ? Number(Deno.env.get('TUNNEL_CONNECT_TIMEOUT_SEC'))
    : 10;
export const SSH_PORT = Deno.env.get('SSH_PORT')
    ? Number(Deno.env.get('SSH_PORT'))
    : 22;
export const SSH_PORT_RANGE: number[] = Deno.env.get('SSH_PORT_RANGE')
    ? String(Deno.env.get('SSH_PORT_RANGE'))
        .split(':')
        .map(item => Number(item))
    : [SSH_PORT, SSH_PORT];
export const PROXY_LOCAL_TEST_PORT = Deno.env.get('PROXY_LOCAL_TEST_PORT')
    ? Number(Deno.env.get('PROXY_LOCAL_TEST_PORT'))
    : 8887;
export const PROXY_LOCAL_PORT = Deno.env.get('PROXY_LOCAL_PORT')
    ? Number(Deno.env.get('PROXY_LOCAL_PORT'))
    : 8888;
export const PROXY_REMOTE_PORT = Deno.env.get('PROXY_REMOTE_PORT')
    ? Number(Deno.env.get('PROXY_REMOTE_PORT'))
    : 8888;
export const KEY_ALGORITHM = Deno.env.get('KEY_ALGORITHM')
    ? String(Deno.env.get('KEY_ALGORITHM'))
    : 'ed25519';
export const KEY_LENGTH = Deno.env.get('KEY_LENGTH')
    ? Number(Deno.env.get('KEY_LENGTH'))
    : 32768;
export const INSTANCE_PROVIDERS: InstanceProvider[] = [];

export const DIGITAL_OCEAN_API_KEY = Deno.env.get('DIGITAL_OCEAN_API_KEY');
if (DIGITAL_OCEAN_API_KEY) {
    INSTANCE_PROVIDERS.push(InstanceProvider.DIGITAL_OCEAN)
}

export const HETZNER_API_KEY = Deno.env.get('HETZNER_API_KEY');
if (HETZNER_API_KEY) {
    INSTANCE_PROVIDERS.push(InstanceProvider.HETZNER)
}

export const VULTR_API_KEY = Deno.env.get('VULTR_API_KEY');
if (VULTR_API_KEY) {
    INSTANCE_PROVIDERS.push(InstanceProvider.VULTR)
}

if (!INSTANCE_PROVIDERS.length) {
    throw `DIGITAL_OCEAN_API_KEY, HETZNER_API_KEY and/or VULTR_API_KEY env variable(s) was/were not provided.`;
}

export const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
export const CLOUDFLARE_API_KEY = Deno.env.get('CLOUDFLARE_API_KEY');
export const CLOUDFLARE_KV_NAMESPACE = Deno.env.get('CLOUDFLARE_KV_NAMESPACE');
export const TEST_PROXY_URL = `http://localhost:${PROXY_LOCAL_TEST_PORT}`;
export const PROXY_URL = `http://localhost:${PROXY_LOCAL_PORT}`;
export const DIGITAL_OCEAN_BASE_URL = 'https://api.digitalocean.com/v2';
export const HETZNER_BASE_URL = 'https://api.hetzner.cloud/v1';
export const VULTR_BASE_URL = 'https://api.vultr.com/v2';
export const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4';
export const __DIRNAME = path.dirname(path.fromFileUrl(import.meta.url)).split('/src')[0];
export const ENV_PATH = `${__DIRNAME}/.env`;
export const HOME_PATH = homedir();
export const DATA_PATH = `${HOME_PATH}/.${APP_ID}`;
export const KEY_PATH = `${DATA_PATH}/.keys`;
export const TMP_PATH = '/tmp';
export const LOG_PATH = `${DATA_PATH}/logs`;
export const KNOWN_HOSTS_PATH = `${HOME_PATH}/.ssh/known_hosts`;
export const DB_FILE_NAME = `${DATA_PATH}/.database.${ENV}.json`;
export const DB_TABLE = 'connections';
export const SSH_LOG_OUTPUT_EXTENSION = '.ssh.out';
export const USER = 'root';
export const CONNECTION_TYPES = [ConnectionType.A, ConnectionType.A];
export const DIGITAL_OCEAN_INSTANCE_SIZE = Deno.env.get('DIGITAL_OCEAN_INSTANCE_SIZE')
    ? String(Deno.env.get('DIGITAL_OCEAN_INSTANCE_SIZE'))
    : 's-1vcpu-512mb-10gb';
export const HETZNER_SERVER_TYPE = Deno.env.get('HETZNER_SERVER_TYPE')
    ? String(Deno.env.get('HETZNER_SERVER_TYPE'))
    : 'cx22';
export const VULTR_INSTANCE_PLAN = Deno.env.get('VULTR_INSTANCE_PLAN')
    ? String(Deno.env.get('VULTR_INSTANCE_PLAN'))
    : 'vc2-1c-1gb';
export const DIGITAL_OCEAN_INSTANCE_IMAGE = Deno.env.get('DIGITAL_OCEAN_INSTANCE_IMAGE')
    ? String(Deno.env.get('DIGITAL_OCEAN_INSTANCE_IMAGE'))
    : 'debian-12-x64';
export const HETZNER_INSTANCE_IMAGE = Deno.env.get('HETZNER_INSTANCE_IMAGE')
    ? String(Deno.env.get('HETZNER_INSTANCE_IMAGE'))
    : 'debian-12';
export const VULTR_INSTANCE_IMAGE = Deno.env.get('VULTR_INSTANCE_IMAGE')
    ? String(Deno.env.get('VULTR_INSTANCE_IMAGE'))
    : 'Debian 12 x64 (bookworm)';
export const GENERATE_SSH_KEY_FILE_NAME = 'generate-ssh-key.exp';
export const CONNECT_SSH_TUNNEL_FILE_NAME = 'connect-ssh-tunnel.exp';
export const HEARTBEAT_INTERVAL_SEC = 10 * 1000;

if (!CLOUDFLARE_ACCOUNT_ID) {
    throw `CLOUDFLARE_ACCOUNT_ID env variable was not provided.`;
}

if (!CLOUDFLARE_API_KEY) {
    throw `CLOUDFLARE_API_KEY env variable was not provided.`;
}

if (!CLOUDFLARE_KV_NAMESPACE) {
    throw `CLOUDFLARE_KV_NAMESPACEY env variable was not provided.`;
}

export const WEB_SERVER_PORT = Deno.env.get('WEB_SERVER_PORT')
    ? Number(Deno.env.get('WEB_SERVER_PORT'))
    : 8080;

export const WEB_SOCKET_PORT = Deno.env.get('WEB_SOCKET_PORT')
    ? Number(Deno.env.get('WEB_SOCKET_PORT'))
    : 3000;Deno.env.get('AUTO_START')

export const AUTO_START = Deno.env.get('AUTO_START') == 'false'
    ? false
    : true;
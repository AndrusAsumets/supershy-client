import * as path from 'https://deno.land/std@0.224.0/path/mod.ts';
import { homedir } from 'node:os';

import { InstanceProvider, ProxyType, DatabaseKey, Config } from './types.ts';

const APP_ID = 'supershy-client';
const ENV = 'dev';
const LOOP_INTERVAL_SEC = 300;
const TUNNEL_CONNECT_TIMEOUT_SEC = 10;
const SSH_PORT = 22;
const SSH_PORT_RANGE: number[] = Deno.env.get('SSH_PORT_RANGE')
    ? String(Deno.env.get('SSH_PORT_RANGE'))
        .split(':')
        .map(item => Number(item))
    : [SSH_PORT, SSH_PORT];
const PROXY_LOCAL_TEST_PORT = 8887;
const PROXY_LOCAL_PORT = 8888;
const PROXY_REMOTE_PORT = 8888;
const KEY_ALGORITHM = 'ed25519';
const KEY_LENGTH = 32768;
const INSTANCE_PROVIDERS: InstanceProvider[] = [];

const DIGITAL_OCEAN_API_KEY = Deno.env.get('DIGITAL_OCEAN_API_KEY');
if (DIGITAL_OCEAN_API_KEY) {
    INSTANCE_PROVIDERS.push(InstanceProvider.DIGITAL_OCEAN)
}

const HETZNER_API_KEY = Deno.env.get('HETZNER_API_KEY');
if (HETZNER_API_KEY) {
    INSTANCE_PROVIDERS.push(InstanceProvider.HETZNER)
}

const VULTR_API_KEY = Deno.env.get('VULTR_API_KEY');
if (VULTR_API_KEY) {
    INSTANCE_PROVIDERS.push(InstanceProvider.VULTR)
}

if (!INSTANCE_PROVIDERS.length) {
    throw `DIGITAL_OCEAN_API_KEY, HETZNER_API_KEY and/or VULTR_API_KEY env variable(s) was/were not provided.`;
}

const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
const CLOUDFLARE_API_KEY = Deno.env.get('CLOUDFLARE_API_KEY');
const CLOUDFLARE_KV_NAMESPACE = Deno.env.get('CLOUDFLARE_KV_NAMESPACE');
const TEST_PROXY_URL = `http://localhost:${PROXY_LOCAL_TEST_PORT}`;
const PROXY_URL = `http://localhost:${PROXY_LOCAL_PORT}`;
const DIGITAL_OCEAN_BASE_URL = 'https://api.digitalocean.com/v2';
const HETZNER_BASE_URL = 'https://api.hetzner.cloud/v1';
const VULTR_BASE_URL = 'https://api.vultr.com/v2';
const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4';
const __DIRNAME = path.dirname(path.fromFileUrl(import.meta.url)).split('/src')[0];
const ENV_PATH = `${__DIRNAME}/.env`;
const HOME_PATH = homedir();
const DATA_PATH = `${HOME_PATH}/.${APP_ID}`;
const KEY_PATH = `${DATA_PATH}/.keys`;
const TMP_PATH = '/tmp';
const LOG_PATH = `${DATA_PATH}/logs`;
const KNOWN_HOSTS_PATH = `${HOME_PATH}/.ssh/known_hosts`;
const DB_FILE_NAME = `${DATA_PATH}/.database.${ENV}.json`;
const SSH_LOG_EXTENSION = '.ssh.log';
const USER = 'root';
const PROXY_TYPES = [ProxyType.A, ProxyType.A];
const DIGITAL_OCEAN_INSTANCE_SIZE = 's-1vcpu-512mb-10gb';
const HETZNER_SERVER_TYPE = 'cx22';
const VULTR_INSTANCE_PLAN = 'vc2-1c-1gb';
const DIGITAL_OCEAN_INSTANCE_IMAGE = 'debian-12-x64';
const HETZNER_INSTANCE_IMAGE = 'debian-12';
const VULTR_INSTANCE_IMAGE = 'Debian 12 x64 (bookworm)';
const GENERATE_SSH_KEY_FILE_NAME = 'generate-ssh-key.exp';
const CONNECT_SSH_TUNNEL_FILE_NAME = 'connect-ssh-tunnel.exp';
const HEARTBEAT_INTERVAL_SEC = 10 * 1000;
const WEB_SERVER_PORT = 8080;
const WEB_SOCKET_PORT = 8880;
const PROXY_AUTO_CONNECT = Deno.env.get('PROXY_AUTO_CONNECT') == 'false'
    ? false
    : true;

if (!CLOUDFLARE_ACCOUNT_ID) {
    throw `CLOUDFLARE_ACCOUNT_ID env variable was not provided.`;
}

if (!CLOUDFLARE_API_KEY) {
    throw `CLOUDFLARE_API_KEY env variable was not provided.`;
}

if (!CLOUDFLARE_KV_NAMESPACE) {
    throw `CLOUDFLARE_KV_NAMESPACEY env variable was not provided.`;
}

export const config: Config = {
    APP_ID,
    ENV,
    LOOP_INTERVAL_SEC,
    TUNNEL_CONNECT_TIMEOUT_SEC,
    SSH_PORT,
    SSH_PORT_RANGE,
    PROXY_LOCAL_TEST_PORT,
    PROXY_LOCAL_PORT,
    PROXY_REMOTE_PORT,
    KEY_ALGORITHM,
    KEY_LENGTH,
    INSTANCE_PROVIDERS,
    DIGITAL_OCEAN_API_KEY,
    HETZNER_API_KEY,
    VULTR_API_KEY,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_KEY,
    CLOUDFLARE_KV_NAMESPACE,
    TEST_PROXY_URL,
    PROXY_URL,
    DIGITAL_OCEAN_BASE_URL,
    HETZNER_BASE_URL,
    VULTR_BASE_URL,
    CLOUDFLARE_BASE_URL,
    __DIRNAME,
    ENV_PATH,
    HOME_PATH,
    DATA_PATH,
    KEY_PATH,
    TMP_PATH,
    LOG_PATH,
    KNOWN_HOSTS_PATH,
    DB_FILE_NAME,
    SSH_LOG_EXTENSION,
    USER,
    PROXY_TYPES,
    DIGITAL_OCEAN_INSTANCE_SIZE,
    HETZNER_SERVER_TYPE,
    VULTR_INSTANCE_PLAN,
    DIGITAL_OCEAN_INSTANCE_IMAGE,
    HETZNER_INSTANCE_IMAGE,
    VULTR_INSTANCE_IMAGE,
    GENERATE_SSH_KEY_FILE_NAME,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    HEARTBEAT_INTERVAL_SEC,
    WEB_SERVER_PORT,
    WEB_SOCKET_PORT,
    PROXY_AUTO_CONNECT,
};
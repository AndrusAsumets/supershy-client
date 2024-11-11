import * as path from 'https://deno.land/std@0.224.0/path/mod.ts';
import { homedir } from 'node:os';

import { Providers, ConnectionTypes } from './types.ts';

const APP_ID = Deno.env.get('APP_ID')
    ? String(Deno.env.get('APP_ID'))
    : 'supershy-client';
const ENV = Deno.env.get('ENV')
    ? String(Deno.env.get('ENV'))
    : 'dev';
const LOOP_INTERVAL_SEC = Deno.env.get('LOOP_INTERVAL_SEC')
    ? Number(Deno.env.get('LOOP_INTERVAL_SEC'))
    : 1800;
const TUNNEL_CONNECT_TIMEOUT_SEC = Deno.env.get('TUNNEL_CONNECT_TIMEOUT_SEC')
    ? Number(Deno.env.get('TUNNEL_CONNECT_TIMEOUT_SEC'))
    : 10;
const SSH_PORT = Deno.env.get('SSH_PORT')
    ? Number(Deno.env.get('SSH_PORT'))
    : 22;
const SSH_PORT_RANGE: number[] = Deno.env.get('SSH_PORT_RANGE')
    ? String(Deno.env.get('SSH_PORT_RANGE'))
        .split(':')
        .map(item => Number(item))
    : [SSH_PORT, SSH_PORT]
const LOCAL_TEST_PORT = Deno.env.get('LOCAL_TEST_PORT')
    ? Number(Deno.env.get('LOCAL_TEST_PORT'))
    : 8887
const LOCAL_PORT = Deno.env.get('LOCAL_PORT')
    ? Number(Deno.env.get('LOCAL_PORT'))
    : 8888;
const REMOTE_PORT = Deno.env.get('REMOTE_PORT')
    ? Number(Deno.env.get('REMOTE_PORT'))
    : 8888;
const KEY_ALGORITHM = Deno.env.get('KEY_ALGORITHM')
    ? String(Deno.env.get('KEY_ALGORITHM'))
    : 'ed25519';
const KEY_LENGTH = Deno.env.get('KEY_LENGTH')
    ? Number(Deno.env.get('KEY_LENGTH'))
    : 32768;
const DIGITAL_OCEAN_API_KEY = Deno.env.get('DIGITAL_OCEAN_API_KEY');
const CONTABO_CLIENT_ID = String(Deno.env.get('CONTABO_CLIENT_ID'));
const VPSSERVER_CLIENT_ID = String(Deno.env.get('VPSSERVER_CLIENT_ID'));
const VPSSERVER_SECRET = String(Deno.env.get('VPSSERVER_SECRET'));
const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
const CLOUDFLARE_API_KEY = Deno.env.get('CLOUDFLARE_API_KEY');
const CLOUDFLARE_KV_NAMESPACE = Deno.env.get('CLOUDFLARE_KV_NAMESPACE');
const INSTANCE_REGIONS = Deno.env.get('INSTANCE_REGIONS')
    ? String(Deno.env.get('INSTANCE_REGIONS'))
        .split(',')
        .filter(region => region.length)
    : [];
const TEST_PROXY_URL = `http://localhost:${LOCAL_TEST_PORT}`;
const DIGITAL_OCEAN_BASE_URL = 'https://api.digitalocean.com/v2';
const VPSSERVER_BASE_URL = 'https://console.vpsserver.com/service';
const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4';
const __DIRNAME = path.dirname(path.fromFileUrl(import.meta.url));
const HOME_PATH = homedir();
const DATA_PATH = `${HOME_PATH}/.${APP_ID}`;
const KEY_PATH = `${DATA_PATH}/.keys`;
const SRC_PATH = `${__DIRNAME}`;
const LOG_PATH = `${DATA_PATH}/logs`;
const KNOWN_HOSTS_PATH = `${HOME_PATH}/.ssh/known_hosts`;
const DB_FILE_NAME = `${DATA_PATH}/.database.${ENV}.json`;
const DB_TABLE = 'connections';
const SSH_LOG_OUTPUT_EXTENSION = '.ssh.out';
const GENERATE_SSH_KEY_FILE_NAME = 'generate-ssh-key.exp';
const CONNECT_SSH_TUNNEL_FILE_NAME = 'connect-ssh-tunnel.exp';
const USER = 'root';
const CONNECTION_TYPES = [ConnectionTypes.A, ConnectionTypes.A];
const PROVIDERS: Providers = {
    'digital_ocean': {
        instanceImage: 'debian-12-x64',
        instanceSize: 's-1vcpu-512mb-10gb',
    },
    'ovh': {
        instanceImage: 'Debian+12',
        instanceSize: 'vps-starter-1-2-20',
    }
}
const INSTANCE_SIZE = Deno.env.get('INSTANCE_SIZE')
    ? String(Deno.env.get('INSTANCE_SIZE'))
    : 's-1vcpu-512mb-10gb';
const INSTANCE_IMAGE = Deno.env.get('INSTANCE_IMAGE')
    ? String(Deno.env.get('INSTANCE_IMAGE'))
    : 'debian-12-x64';

if (!DIGITAL_OCEAN_API_KEY) {
    throw `DIGITAL_OCEAN_API_KEY env variable was not provided.`;
}

if (!CLOUDFLARE_ACCOUNT_ID) {
    throw `CLOUDFLARE_ACCOUNT_ID env variable was not provided.`;
}

if (!CLOUDFLARE_API_KEY) {
    throw `CLOUDFLARE_API_KEY env variable was not provided.`;
}

if (!CLOUDFLARE_KV_NAMESPACE) {
    throw `CLOUDFLARE_KV_NAMESPACEY env variable was not provided.`;
}

export {
    ENV,
    APP_ID,
    LOOP_INTERVAL_SEC,
    TUNNEL_CONNECT_TIMEOUT_SEC,
    SSH_PORT_RANGE,
    LOCAL_TEST_PORT,
    LOCAL_PORT,
    REMOTE_PORT,
    KEY_ALGORITHM,
    KEY_LENGTH,
    DIGITAL_OCEAN_API_KEY,
    CONTABO_CLIENT_ID,
    VPSSERVER_CLIENT_ID,
    VPSSERVER_SECRET,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_KEY,
    CLOUDFLARE_KV_NAMESPACE,
    INSTANCE_SIZE,
    INSTANCE_IMAGE,
    INSTANCE_REGIONS,
    TEST_PROXY_URL,
    DIGITAL_OCEAN_BASE_URL,
    VPSSERVER_BASE_URL,
    CLOUDFLARE_BASE_URL,
    __DIRNAME,
    HOME_PATH,
    DATA_PATH,
    KEY_PATH,
    SRC_PATH,
    LOG_PATH,
    KNOWN_HOSTS_PATH,
    DB_FILE_NAME,
    DB_TABLE,
    SSH_LOG_OUTPUT_EXTENSION,
    GENERATE_SSH_KEY_FILE_NAME,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    USER,
    CONNECTION_TYPES,
};
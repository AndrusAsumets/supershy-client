import * as path from 'https://deno.land/std@0.224.0/path/mod.ts';
import { homedir } from 'node:os';

import { ConnectionTypes } from './types.ts';

const ENV = String(Deno.env.get('ENV'));
const APP_ID = String(Deno.env.get('APP_ID'));
const LOOP_INTERVAL_MIN = Number(Deno.env.get('LOOP_INTERVAL_MIN'));
const LOOP_TIMEOUT_MIN = Number(Deno.env.get('LOOP_TIMEOUT_MIN'));
const LOCAL_TEST_PORT = Number(Deno.env.get('LOCAL_TEST_PORT'));
const LOCAL_PORT = Number(Deno.env.get('LOCAL_PORT'));
const REMOTE_PORT = Number(Deno.env.get('REMOTE_PORT'));
const KEY_ALGORITHM = String(Deno.env.get('KEY_ALGORITHM'));
const DIGITAL_OCEAN_API_KEY = String(Deno.env.get('DIGITAL_OCEAN_API_KEY'));
const CLOUDFLARE_ACCOUNT_ID = String(Deno.env.get('CLOUDFLARE_ACCOUNT_ID'));
const CLOUDFLARE_API_KEY = String(Deno.env.get('CLOUDFLARE_API_KEY'));
const CLOUDFLARE_KV_NAMESPACE = String(Deno.env.get('CLOUDFLARE_KV_NAMESPACE'));
const DROPLET_SIZE = String(Deno.env.get('DROPLET_SIZE'));
const DROPLET_REGIONS = String(Deno.env.get('DROPLET_REGIONS'))
    .split(',')
    .filter(region => region.length);
const TEST_PROXY_URL = `http://localhost:${LOCAL_TEST_PORT}`;
const DIGITAL_OCEAN_BASE_URL = 'https://api.digitalocean.com/v2';
const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4';
const __DIRNAME = path.dirname(path.fromFileUrl(import.meta.url));
const HOME_PATH = homedir();
const DATA_PATH = `${HOME_PATH}/.${APP_ID}`;
const KEY_PATH = `${DATA_PATH}/.keys`;
const SRC_PATH = `${__DIRNAME}`;
const LOG_PATH = `${DATA_PATH}/logs`;
const KNOWN_HOSTS_PATH = `${HOME_PATH}/.ssh/known_hosts`;
const DB_FILE_NAME = `${DATA_PATH}/.database.${ENV}.json`;
const SSH_LOG_OUTPUT_EXTENSION = '.ssh.out';
const GENERATE_SSH_KEY_FILE_NAME = 'generate-ssh-key.exp';
const CONNECT_SSH_TUNNEL_FILE_NAME = 'connect-ssh-tunnel.exp';
const USER = 'root';
const CONNECTION_TYPES = [ConnectionTypes.A, ConnectionTypes.A];

export {
    ENV,
    APP_ID,
    LOOP_INTERVAL_MIN,
    LOOP_TIMEOUT_MIN,
    LOCAL_TEST_PORT,
    LOCAL_PORT,
    REMOTE_PORT,
    KEY_ALGORITHM,
    DIGITAL_OCEAN_API_KEY,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_KEY,
    CLOUDFLARE_KV_NAMESPACE,
    DROPLET_SIZE,
    DROPLET_REGIONS,
    TEST_PROXY_URL,
    DIGITAL_OCEAN_BASE_URL,
    CLOUDFLARE_BASE_URL,
    __DIRNAME,
    HOME_PATH,
    DATA_PATH,
    KEY_PATH,
    SRC_PATH,
    LOG_PATH,
    KNOWN_HOSTS_PATH,
    DB_FILE_NAME,
    SSH_LOG_OUTPUT_EXTENSION,
    GENERATE_SSH_KEY_FILE_NAME,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    USER,
    CONNECTION_TYPES,
}
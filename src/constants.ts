import { homedir } from 'node:os';
import * as path from 'https://deno.land/std@0.224.0/path/mod.ts';
import { ProxyType, Config, InstanceProvider, LoopStatus, ConnectionStatus } from './types.ts';

const APP_ID = 'supershy-client';
const ENV = 'dev';
const PROXY_RECYCLE_INTERVAL_SEC = 1800;
const LOOP_STATUS = LoopStatus.INACTIVE;
const CONNECTION_STATUS = ConnectionStatus.DISCONNECTED;
const PROXY_SYSTEM_WIDE = false;
const CONNECTION_KILLSWITCH = false;
const AUTO_LAUNCH_WEB = true;
const SSH_PORT_RANGE: number[] = [10000, 65535];
const SSH_KEY_ALGORITHM = 'ed25519';
const SSH_KEY_LENGTH = 32768;
const DIGITAL_OCEAN_API_KEY = '';
const HETZNER_API_KEY = '';
const VULTR_API_KEY = '';
const CLOUDFLARE_ACCOUNT_ID = '';
const CLOUDFLARE_API_KEY = '';
const CLOUDFLARE_KV_NAMESPACE = '';
const DIGITAL_OCEAN_BASE_URL = 'https://api.digitalocean.com/v2';
const HETZNER_BASE_URL = 'https://api.hetzner.cloud/v1';
const VULTR_BASE_URL = 'https://api.vultr.com/v2';
const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4';
const HOME_PATH = homedir();
const __DIRNAME = path.dirname(path.fromFileUrl(import.meta.url));
const UI_PATH = `${__DIRNAME}/ui`;
const DATA_PATH = `${HOME_PATH}/.supershy-data`;
const BACKUP_PATH = `${DATA_PATH}/backups`;
const SCRIPT_PATH = `${DATA_PATH}/scripts`;
const SSH_KEY_PATH = `${DATA_PATH}/.keys`;
const LOG_PATH = `${DATA_PATH}/logs`;
const SSH_PATH = `${HOME_PATH}/.ssh`;
const SSH_KNOWN_HOSTS_PATH = `${SSH_PATH}/known_hosts`;
const DB_FILE_PATH = `${DATA_PATH}/.database.${ENV}.json`;
const SSH_LOG_EXTENSION = '.ssh.log';
const SSH_USER = 'root';
const SSH_CONNECTION_TIMEOUT_SEC = 5;
const SSHUTTLE_PID_FILE_PATH = `${DATA_PATH}/sshuttle.pid`;
const PROXY_TYPES = [ProxyType.A, ProxyType.A];
const DIGITAL_OCEAN_INSTANCE_SIZE = 's-1vcpu-512mb-10gb';
const HETZNER_SERVER_TYPE = 'cx22';
const VULTR_INSTANCE_PLAN = 'vc2-1c-1gb';
const DIGITAL_OCEAN_INSTANCE_IMAGE = 'debian-12-x64';
const HETZNER_INSTANCE_IMAGE = 'debian-12';
const VULTR_INSTANCE_IMAGE = 'Debian 12 x64 (bookworm)';
const INSTANCE_PROVIDERS: InstanceProvider[] = [];
const INSTANCE_PROVIDERS_DISABLED: InstanceProvider[] = [];
const HEARTBEAT_INTERVAL_SEC = 10 * 1000;
const WEB_SERVER_PORT = 8080;
const WEB_URL = `http://localhost:${WEB_SERVER_PORT}`;
const WEB_SOCKET_PORT = 8880;
const PROXY_ENABLED = false;
const DIGITAL_OCEAN_REGIONS: Record<string, string> = {
    nyc: 'US',
    ams: 'NL',
    sfo: 'US',
    sgp: 'SG',
    lon: 'UK',
    fra: 'DE',
    tor: 'CA',
    blr: 'IN',
    syd: 'AU',
};
const INSTANCE_COUNTRIES: string[] = [];
const INSTANCE_COUNTRIES_DISABLED: string[] = [];

export const config: Config = {
    CONNECTION_KILLSWITCH,
    PROXY_SYSTEM_WIDE,
    LOOP_STATUS,
    CONNECTION_STATUS,
    PROXY_RECYCLE_INTERVAL_SEC,
    DIGITAL_OCEAN_API_KEY,
    HETZNER_API_KEY,
    VULTR_API_KEY,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_KEY,
    CLOUDFLARE_KV_NAMESPACE,
    DIGITAL_OCEAN_INSTANCE_SIZE,
    HETZNER_SERVER_TYPE,
    VULTR_INSTANCE_PLAN,
    DIGITAL_OCEAN_INSTANCE_IMAGE,
    HETZNER_INSTANCE_IMAGE,
    VULTR_INSTANCE_IMAGE,
    PROXY_ENABLED,
    AUTO_LAUNCH_WEB,
    APP_ID,
    ENV,
    DIGITAL_OCEAN_BASE_URL,
    HETZNER_BASE_URL,
    VULTR_BASE_URL,
    CLOUDFLARE_BASE_URL,
    INSTANCE_PROVIDERS,
    INSTANCE_PROVIDERS_DISABLED,
    HEARTBEAT_INTERVAL_SEC,
    HOME_PATH,
    DATA_PATH,
    BACKUP_PATH,
    SCRIPT_PATH,
    SSH_KEY_PATH,
    UI_PATH,
    SSH_PORT_RANGE,
    SSH_KEY_ALGORITHM,
    SSH_KEY_LENGTH,
    SSH_PATH,
    SSH_CONNECTION_TIMEOUT_SEC,
    WEB_SERVER_PORT,
    WEB_URL,
    WEB_SOCKET_PORT,
    SSHUTTLE_PID_FILE_PATH,
    SSH_KNOWN_HOSTS_PATH,
    DB_FILE_PATH,
    LOG_PATH,
    SSH_LOG_EXTENSION,
    SSH_USER,
    PROXY_TYPES,
    DIGITAL_OCEAN_REGIONS,
    INSTANCE_COUNTRIES,
    INSTANCE_COUNTRIES_DISABLED,
};
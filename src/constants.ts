import { homedir } from 'node:os';
import * as path from 'https://deno.land/std@0.224.0/path/mod.ts';
import { platform as getPlatform } from 'node:os';
import { NodeType, Config, InstanceProvider, LoopStatus, ConnectionStatus, Tunnel, Platform } from './types.ts';

const APP_ENABLED = false;
const APP_ID = 'supershy-client';
const ENV = 'dev';
const PLATFORM = getPlatform() as Platform;
const NODE_RECYCLE_INTERVAL_SEC = 1800;
const NODE_RESERVE_COUNT = 1;
const NODE_CURRENT_RESERVE_COUNT = 0;
const LOOP_STATUS = LoopStatus.INACTIVE;
const CONNECTION_STATUS = ConnectionStatus.DISCONNECTED;
const TUNNEL_KILLSWITCH = false;
const AUTO_LAUNCH_WEB = true;
const PROXY_LOCAL_PORT = 8888;
const PROXY_REMOTE_PORT = 8888;
const TUNNEL_PORT_RANGE: string = '10000:65535';
const SSH_KEY_ALGORITHM = 'ed25519';
const SSH_KEY_LENGTH = 32768;
const EXOSCALE_API_KEY = '';
const EXOSCALE_API_SECRET = '';
const HETZNER_API_KEY = '';
const CLOUDFLARE_ACCOUNT_ID = '';
const CLOUDFLARE_API_KEY = '';
const CLOUDFLARE_KV_NAMESPACE = '';
const HOME_PATH = homedir();
const __DIRNAME = path.dirname(path.fromFileUrl(import.meta.url));
const UI_PATH = `${__DIRNAME}/ui`;
const DATA_PATH = `${HOME_PATH}/.supershy-data`;
const KEY_PATH = `${DATA_PATH}/.keys`;
const LOG_PATH = `${DATA_PATH}/logs`;
const SSH_PATH = `${HOME_PATH}/.ssh`;
const SSH_KNOWN_HOSTS_PATH = `${SSH_PATH}/known_hosts`;
const WIREGUARD_CONFIG_PATH = `${DATA_PATH}/wg0.conf`;
const WIREGUARD_HOST = '10.0.0.1';
const DB_FILE_PATH = `${DATA_PATH}/.database.${ENV}.json`;
const SSH_LOG_EXTENSION = '-ssh.log';
const CONNECT_TIMEOUT_SEC = 30;
const POST_CONNECT_DELAY_SEC = 5;
const SSHUTTLE_PID_FILE_PATH = `${DATA_PATH}/sshuttle.pid`;
const NODE_TYPES = [...Array(NODE_RESERVE_COUNT + 1).keys().map(() => NodeType.A)];
const EXOSCALE_INSTANCE_SIZE = 'micro';
const HETZNER_SERVER_TYPE = 'cpx11';
const EXOSCALE_TEMPLATE_NAME = 'Linux Debian 12 (Bookworm) 64-bit';
const HETZNER_INSTANCE_IMAGE = 'debian-12';
const EXOSCALE_DISK_SIZE = 10;
const INSTANCE_PROVIDERS: InstanceProvider[] = [];
const INSTANCE_PROVIDERS_DISABLED: InstanceProvider[] = [];
const HEARTBEAT_INTERVAL_SEC = 10;
const EXOSCALE_REQUEST_EXPIRATION_SEC = 600;
const WEB_SERVER_PORT = 8080;
const WEB_URL = `http://localhost:${WEB_SERVER_PORT}`;
const WEB_SOCKET_PORT = 8880;
const TUNNELS: Tunnel[] = [];
const TUNNELS_ENABLED: Tunnel[] = [Tunnel.WIREGUARD];
const INSTANCE_COUNTRIES: string[] = [];
const INSTANCE_COUNTRIES_DISABLED: string[] = [];

export const config: Config = {
    TUNNEL_KILLSWITCH,
    LOOP_STATUS,
    CONNECTION_STATUS,
    NODE_RECYCLE_INTERVAL_SEC,
    NODE_RESERVE_COUNT,
    NODE_CURRENT_RESERVE_COUNT,
    PROXY_LOCAL_PORT,
    PROXY_REMOTE_PORT,
    EXOSCALE_API_KEY,
    EXOSCALE_API_SECRET,
    HETZNER_API_KEY,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_KEY,
    CLOUDFLARE_KV_NAMESPACE,
    EXOSCALE_INSTANCE_SIZE,
    HETZNER_SERVER_TYPE,
    EXOSCALE_TEMPLATE_NAME,
    HETZNER_INSTANCE_IMAGE,
    EXOSCALE_DISK_SIZE,
    APP_ENABLED,
    AUTO_LAUNCH_WEB,
    APP_ID,
    ENV,
    PLATFORM,
    INSTANCE_PROVIDERS,
    INSTANCE_PROVIDERS_DISABLED,
    HEARTBEAT_INTERVAL_SEC,
    EXOSCALE_REQUEST_EXPIRATION_SEC,
    HOME_PATH,
    DATA_PATH,
    KEY_PATH,
    UI_PATH,
    TUNNEL_PORT_RANGE,
    SSH_KEY_ALGORITHM,
    SSH_KEY_LENGTH,
    SSH_PATH,
    CONNECT_TIMEOUT_SEC,
    POST_CONNECT_DELAY_SEC,
    WEB_SERVER_PORT,
    WEB_URL,
    WEB_SOCKET_PORT,
    SSHUTTLE_PID_FILE_PATH,
    SSH_KNOWN_HOSTS_PATH,
    WIREGUARD_CONFIG_PATH,
    WIREGUARD_HOST,
    DB_FILE_PATH,
    LOG_PATH,
    SSH_LOG_EXTENSION,
    NODE_TYPES,
    TUNNELS,
    TUNNELS_ENABLED,
    INSTANCE_COUNTRIES,
    INSTANCE_COUNTRIES_DISABLED,
};
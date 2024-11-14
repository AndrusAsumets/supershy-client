import * as path from 'https://deno.land/std@0.224.0/path/mod.ts';
import { homedir } from 'node:os';

import { InstanceProvider, ConnectionType } from './types.ts';

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
    : [SSH_PORT, SSH_PORT];
const PROXY_LOCAL_TEST_PORT = Deno.env.get('PROXY_LOCAL_TEST_PORT')
    ? Number(Deno.env.get('PROXY_LOCAL_TEST_PORT'))
    : 8887;
const PROXY_LOCAL_PORT = Deno.env.get('PROXY_LOCAL_PORT')
    ? Number(Deno.env.get('PROXY_LOCAL_PORT'))
    : 8888;
const PROXY_REMOTE_PORT = Deno.env.get('PROXY_REMOTE_PORT')
    ? Number(Deno.env.get('PROXY_REMOTE_PORT'))
    : 8888;
const KEY_ALGORITHM = Deno.env.get('KEY_ALGORITHM')
    ? String(Deno.env.get('KEY_ALGORITHM'))
    : 'ed25519';
const KEY_LENGTH = Deno.env.get('KEY_LENGTH')
    ? Number(Deno.env.get('KEY_LENGTH'))
    : 32768;
const INSTANCE_PROVIDERS: InstanceProvider[] = [];

const DIGITAL_OCEAN_API_KEY = Deno.env.get('DIGITAL_OCEAN_API_KEY');
if (DIGITAL_OCEAN_API_KEY) {
    INSTANCE_PROVIDERS.push(InstanceProvider.DIGITAL_OCEAN)
}

const HETZNER_API_KEY = Deno.env.get('HETZNER_API_KEY');
if (HETZNER_API_KEY) {
    INSTANCE_PROVIDERS.push(InstanceProvider.HETZNER)
}

if (!INSTANCE_PROVIDERS.length) {
    throw `DIGITAL_OCEAN_API_KEY and/or HETZNER_API_KEY env variable was not provided.`;
}

const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
const CLOUDFLARE_API_KEY = Deno.env.get('CLOUDFLARE_API_KEY');
const CLOUDFLARE_KV_NAMESPACE = Deno.env.get('CLOUDFLARE_KV_NAMESPACE');
const TEST_PROXY_URL = `http://localhost:${PROXY_LOCAL_TEST_PORT}`;
const DIGITAL_OCEAN_BASE_URL = 'https://api.digitalocean.com/v2';
const HETZNER_BASE_URL = 'https://api.hetzner.cloud/v1';
const CLOUDFLARE_BASE_URL = 'https://api.cloudflare.com/client/v4';
const __DIRNAME = path.dirname(path.fromFileUrl(import.meta.url));
const HOME_PATH = homedir();
const DATA_PATH = `${HOME_PATH}/.${APP_ID}`;
const KEY_PATH = `${DATA_PATH}/.keys`;
const TMP_PATH = '/tmp';
const LOG_PATH = `${DATA_PATH}/logs`;
const KNOWN_HOSTS_PATH = `${HOME_PATH}/.ssh/known_hosts`;
const DB_FILE_NAME = `${DATA_PATH}/.database.${ENV}.json`;
const DB_TABLE = 'connections';
const SSH_LOG_OUTPUT_EXTENSION = '.ssh.out';
const USER = 'root';
const CONNECTION_TYPES = [ConnectionType.A, ConnectionType.A];
const DIGITAL_OCEAN_INSTANCE_SIZE = Deno.env.get('DIGITAL_OCEAN_INSTANCE_SIZE')
    ? String(Deno.env.get('DIGITAL_OCEAN_INSTANCE_SIZE'))
    : 's-1vcpu-512mb-10gb';
const HETZNER_SERVER_TYPE = Deno.env.get('HETZNER_SERVER_TYPE')
    ? String(Deno.env.get('HETZNER_SERVER_TYPE'))
    : 'cx22';
const DIGITAL_OCEAN_INSTANCE_IMAGE = Deno.env.get('DIGITAL_OCEAN_INSTANCE_IMAGE')
    ? String(Deno.env.get('DIGITAL_OCEAN_INSTANCE_IMAGE'))
    : 'debian-12-x64';
const HETZNER_INSTANCE_IMAGE = Deno.env.get('HETZNER_INSTANCE_IMAGE')
    ? String(Deno.env.get('HETZNER_INSTANCE_IMAGE'))
    : 'debian-12';

if (!CLOUDFLARE_ACCOUNT_ID) {
    throw `CLOUDFLARE_ACCOUNT_ID env variable was not provided.`;
}

if (!CLOUDFLARE_API_KEY) {
    throw `CLOUDFLARE_API_KEY env variable was not provided.`;
}

if (!CLOUDFLARE_KV_NAMESPACE) {
    throw `CLOUDFLARE_KV_NAMESPACEY env variable was not provided.`;
}

const GENERATE_SSH_KEY_FILE_NAME = 'generate-ssh-key.exp';
const CONNECT_SSH_TUNNEL_FILE_NAME = 'connect-ssh-tunnel.exp';
const GENERATE_SSH_KEY_FILE = `#!/usr/bin/expect -f

set passphrase [lrange $argv 0 0]
set key_path [lrange $argv 1 1]
set key_algorithm [lrange $argv 2 2]
set key_length [lrange $argv 3 3]

spawn ssh-keygen -t $key_algorithm -b $key_length -f $key_path
expect "*passphrase*"
send -- "$passphrase\r"
expect "*?again:*"
send -- "$passphrase\r"
interact
exit 0`;
const CONNECT_SSH_TUNNEL_FILE = `#!/usr/bin/expect -f

set passphrase [lrange $argv 0 0]
set server [lrange $argv 1 1]
set user [lrange $argv 2 2]
set ssh_port [lrange $argv 3 3]
set local_port [lrange $argv 4 4]
set remote_port [lrange $argv 5 5]
set key_path [lrange $argv 6 6]
set output_path [lrange $argv 7 7]

spawn -ignore HUP ssh -v $user@$server -f -N -L $local_port:0.0.0.0:$remote_port -p $ssh_port -i $key_path -o StrictHostKeyChecking=yes -E $output_path
expect "*passphrase*"
send -- "$passphrase\r"
interact
expect_background
exit 0`;

export {
    ENV,
    APP_ID,
    LOOP_INTERVAL_SEC,
    TUNNEL_CONNECT_TIMEOUT_SEC,
    SSH_PORT_RANGE,
    PROXY_LOCAL_TEST_PORT,
    PROXY_LOCAL_PORT,
    PROXY_REMOTE_PORT,
    KEY_ALGORITHM,
    KEY_LENGTH,
    DIGITAL_OCEAN_API_KEY,
    HETZNER_API_KEY,
    INSTANCE_PROVIDERS,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_KEY,
    CLOUDFLARE_KV_NAMESPACE,
    DIGITAL_OCEAN_INSTANCE_SIZE,
    DIGITAL_OCEAN_INSTANCE_IMAGE,
    TEST_PROXY_URL,
    DIGITAL_OCEAN_BASE_URL,
    HETZNER_BASE_URL,
    HETZNER_SERVER_TYPE,
    HETZNER_INSTANCE_IMAGE,
    CLOUDFLARE_BASE_URL,
    __DIRNAME,
    HOME_PATH,
    DATA_PATH,
    KEY_PATH,
    TMP_PATH,
    LOG_PATH,
    KNOWN_HOSTS_PATH,
    DB_FILE_NAME,
    DB_TABLE,
    SSH_LOG_OUTPUT_EXTENSION,
    GENERATE_SSH_KEY_FILE_NAME,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    GENERATE_SSH_KEY_FILE,
    CONNECT_SSH_TUNNEL_FILE,
    USER,
    CONNECTION_TYPES,
};
import { logger as _logger } from './logger.ts';
import {
    config,
    CLOUDFLARE_BASE_URL,
    TMP_PATH,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    USER,
    LOG_PATH,
    SSH_LOG_EXTENSION,
    ENV_PATH,
    APP_ID,
    ENV,
} from './constants.ts';
import { Proxy } from './types.ts';
import * as lib from './lib.ts';
import * as integrations from './integrations.ts';

const logger = _logger.get();

export const getUserData = (
    proxyUuid: string,
    sshPort: number,
    jwtSecret: string,
) => {
    return `
#cloud-config
runcmd:
    - echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config
    - echo 'Port ${sshPort}' >> /etc/ssh/sshd_config
    - sudo systemctl restart ssh

    - sudo apt update
    - sudo apt dist-upgrade -y
    - sudo apt install tinyproxy -y
    - echo 'Port ${config.PROXY_REMOTE_PORT}' >> tinyproxy.conf
    - echo 'Listen 0.0.0.0' >> tinyproxy.conf
    - echo 'Timeout 600' >> tinyproxy.conf
    - echo 'Allow 0.0.0.0' >> tinyproxy.conf
    - tinyproxy -d -c tinyproxy.conf

    - HOST_KEY=$(cat /etc/ssh/ssh_host_ed25519_key.pub | cut -d ' ' -f 2)
    - ENCODED_HOST_KEY=$(python3 -c 'import sys;import jwt;payload={};payload[\"hostKey\"]=sys.argv[1];print(jwt.encode(payload, sys.argv[2], algorithm=\"HS256\"))' $HOST_KEY ${jwtSecret})
    - curl --request PUT -H 'Content-Type=*\/*' --data $ENCODED_HOST_KEY --url ${CLOUDFLARE_BASE_URL}/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${config.CLOUDFLARE_KV_NAMESPACE}/values/${proxyUuid} --oauth2-bearer ${config.CLOUDFLARE_API_KEY}

    - iptables -A INPUT -p tcp --dport ${sshPort} -j ACCEPT
`;
};

export const getConnectionString = (
    proxy: Proxy,
): string => {
    const {
        passphrase,
        instanceIp,
        sshPort,
        keyPath,
        sshLogPath
    } = proxy;
    return `${TMP_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME} ${passphrase} ${instanceIp} ${USER} ${sshPort} ${config.PROXY_LOCAL_PORT} ${config.PROXY_REMOTE_PORT} ${keyPath} ${sshLogPath}`;
};

export const getSshLogPath = (proxyUuid: string): string =>`${LOG_PATH}/${proxyUuid}${SSH_LOG_EXTENSION}`;

export const updateEnv = (
    key: string,
    value: boolean | number | string
) => {
    const newLine = '\n';
    const separator = `${key}=`;
    let env = Deno.readTextFileSync(ENV_PATH);

    if (!env.includes(separator)) {
        env = `${env}${newLine}${separator}`;
    }

    env = env
        .split(newLine)
        .map((line: string) =>
            line.startsWith(separator)
                ? `${separator}${value}`
                : line
        )
        .join(newLine);

    Deno.writeTextFileSync(ENV_PATH, env);
};

export const exit = async (
    message: string,
    onPurpose = false
) => {
    !onPurpose && logger.error(message);
    onPurpose && await integrations.shell.pkill(`${APP_ID}-${ENV}`);
    await lib.sleep(1000);
    throw new Error();
};

import { logger as _logger } from './logger.ts';
import {
    PROXY_LOCAL_PORT,
    PROXY_REMOTE_PORT,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_KEY,
    CLOUDFLARE_KV_NAMESPACE,
    CLOUDFLARE_BASE_URL,
    TMP_PATH,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    USER,
    LOG_PATH,
    SSH_LOG_OUTPUT_EXTENSION,
    ENV_PATH,
} from './constants.ts';
import { Connection } from './types.ts';
import * as lib from './lib.ts';

const logger = _logger.get();

export const getUserData = (
    connectionUuid: string,
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
    - echo 'Port ${PROXY_REMOTE_PORT}' >> tinyproxy.conf
    - echo 'Listen 0.0.0.0' >> tinyproxy.conf
    - echo 'Timeout 600' >> tinyproxy.conf
    - echo 'Allow 0.0.0.0' >> tinyproxy.conf
    - tinyproxy -d -c tinyproxy.conf

    - HOST_KEY=$(cat /etc/ssh/ssh_host_ed25519_key.pub | cut -d ' ' -f 2)
    - ENCODED_HOST_KEY=$(python3 -c 'import sys;import jwt;payload={};payload[\"hostKey\"]=sys.argv[1];print(jwt.encode(payload, sys.argv[2], algorithm=\"HS256\"))' $HOST_KEY ${jwtSecret})
    - curl --request PUT -H 'Content-Type=*\/*' --data $ENCODED_HOST_KEY --url ${CLOUDFLARE_BASE_URL}/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/values/${connectionUuid} --oauth2-bearer ${CLOUDFLARE_API_KEY}

    - iptables -A INPUT -p tcp --dport ${sshPort} -j ACCEPT
`;
};

export const getConnectionString = (
    connection: Connection,
): string => {
    const {
        passphrase,
        instanceIp,
        sshPort,
        keyPath,
        sshLogOutputPath
    } = connection;
    return `${TMP_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME} ${passphrase} ${instanceIp} ${USER} ${sshPort} ${PROXY_LOCAL_PORT} ${PROXY_REMOTE_PORT} ${keyPath} ${sshLogOutputPath}`;
};

export const getSshLogOutputPath = (connectionUuid: string): string =>`${LOG_PATH}/${connectionUuid}${SSH_LOG_OUTPUT_EXTENSION}`;


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
    await lib.sleep(1000);
    throw new Error();
};
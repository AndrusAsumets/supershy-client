import { logger as _logger } from './logger.ts';
import * as models from './models.ts';

const {
    CLOUDFLARE_BASE_URL,
    TMP_PATH,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    SSH_USER,
    LOG_PATH,
    SSH_LOG_EXTENSION,
    APP_ID,
    ENV,
    PROXY_LOCAL_PORT,
    PROXY_REMOTE_PORT,
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_KV_NAMESPACE,
    CLOUDFLARE_API_KEY,
} = models.getConfig();
import { Config, Proxy, InstanceProvider } from './types.ts';
import * as lib from './lib.ts';
import * as integrations from './integrations.ts';

const logger = _logger.get();

export const setInstanceProviders = (
    config: Config
) => {
    config.INSTANCE_PROVIDERS = [];

    if (config.DIGITAL_OCEAN_API_KEY) {
        config.INSTANCE_PROVIDERS.push(InstanceProvider.DIGITAL_OCEAN)
    }

    if (config.HETZNER_API_KEY) {
        config.INSTANCE_PROVIDERS.push(InstanceProvider.HETZNER)
    }

    if (config.VULTR_API_KEY) {
        config.INSTANCE_PROVIDERS.push(InstanceProvider.VULTR)
    }

    return config;
};

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
    - echo 'Port ${PROXY_REMOTE_PORT}' >> tinyproxy.conf
    - echo 'Listen 0.0.0.0' >> tinyproxy.conf
    - echo 'Timeout 600' >> tinyproxy.conf
    - echo 'Allow 0.0.0.0' >> tinyproxy.conf
    - tinyproxy -d -c tinyproxy.conf

    - HOST_KEY=$(cat /etc/ssh/ssh_host_ed25519_key.pub | cut -d ' ' -f 2)
    - ENCODED_HOST_KEY=$(python3 -c 'import sys;import jwt;payload={};payload[\"hostKey\"]=sys.argv[1];print(jwt.encode(payload, sys.argv[2], algorithm=\"HS256\"))' $HOST_KEY ${jwtSecret})
    - curl --request PUT -H 'Content-Type=*\/*' --data $ENCODED_HOST_KEY --url ${CLOUDFLARE_BASE_URL}/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE}/values/${proxyUuid} --oauth2-bearer ${CLOUDFLARE_API_KEY}

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
        sshKeyPath,
        sshLogPath
    } = proxy;
    return `${TMP_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME} ${passphrase} ${instanceIp} ${SSH_USER} ${sshPort} ${PROXY_LOCAL_PORT} ${PROXY_REMOTE_PORT} ${sshKeyPath} ${sshLogPath}`;
};

export const getSshLogPath = (
    proxyUuid: string
): string =>`${LOG_PATH}/${proxyUuid}${SSH_LOG_EXTENSION}`;

export const exit = async (
    message: string,
    onPurpose = false
) => {
    !onPurpose && logger.error(message);
    const hasProxies = Object.keys(models.getProxies()).length > 0;
    onPurpose && hasProxies && await integrations.shell.pkill(`${APP_ID}-${ENV}`);
    await lib.sleep(1000);
    throw new Error();
};

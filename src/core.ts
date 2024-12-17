import { logger as _logger } from './logger.ts';
import * as models from './models.ts';

const { config } = models;
const {
    CLOUDFLARE_BASE_URL,
    DATA_PATH,
    SCRIPT_PATH,
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
    ENABLE_TUN_FILE_NAME,
    DISABLE_TUN_FILE_NAME,
} = config();
import { Config, Proxy, InstanceProvider } from './types.ts';
import * as lib from './lib.ts';
import * as integrations from './integrations.ts';

const logger = _logger.get();

export const setInstanceProviders = (
    config: Config
): Config => {
    config.INSTANCE_PROVIDERS = [];
    config.DIGITAL_OCEAN_API_KEY && config.INSTANCE_PROVIDERS.push(InstanceProvider.DIGITAL_OCEAN);
    config.HETZNER_API_KEY && config.INSTANCE_PROVIDERS.push(InstanceProvider.HETZNER);
    config.VULTR_API_KEY && config.INSTANCE_PROVIDERS.push(InstanceProvider.VULTR);
    return config;
};

export const setInstanceCountries = async (
    config: Config
): Promise<Config> => {
    const hasHeartbeat = await integrations.kv.cloudflare.heartbeat();
    if (!hasHeartbeat) {
        return config;
    }

    const instanceProviders: InstanceProvider[] = config
        .INSTANCE_PROVIDERS
        .filter((instanceProvider: InstanceProvider) =>
            !config.INSTANCE_PROVIDERS_DISABLED.includes(instanceProvider)
    );
    config.INSTANCE_COUNTRIES = [];

    let index = 0;
    while(index < instanceProviders.length) {
        const instanceProvider: InstanceProvider = instanceProviders[index];
        const countries = await integrations.compute[instanceProvider].countries.list();
        countries
            .forEach((country: string) =>
                !config.INSTANCE_COUNTRIES.includes(country) && config.INSTANCE_COUNTRIES.push(country)
            );
        index = index + 1;
    }

    config.INSTANCE_COUNTRIES = lib.shuffle(config.INSTANCE_COUNTRIES);

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
    - ENCODED_HOST_KEY=$(python3 -c 'import sys;import jwt;payload={};payload[\"sshHostKey\"]=sys.argv[1];print(jwt.encode(payload, sys.argv[2], algorithm=\"HS256\"))' $HOST_KEY ${jwtSecret})
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
    return `${SCRIPT_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME} ${passphrase} ${instanceIp} ${SSH_USER} ${sshPort} ${PROXY_LOCAL_PORT} ${PROXY_REMOTE_PORT} ${sshKeyPath} ${sshLogPath}`;
};

export const getSshLogPath = (
    proxyUuid: string
): string =>`${LOG_PATH}/${proxyUuid}${SSH_LOG_EXTENSION}`;

export const enableSystemWideProxy = (proxy: Proxy) => {
    integrations.shell.command(`bash ${SCRIPT_PATH}/${ENABLE_TUN_FILE_NAME} ${proxy.proxyLocalPort} ${proxy.instanceIp} ${proxy.sshPort}`);
};

export const disableSystemWideProxy = () => {
    integrations.shell.command(`bash ${SCRIPT_PATH}/${DISABLE_TUN_FILE_NAME}`);
};

export const exit = async (
    message: string,
    onPurpose = false
) => {
    !onPurpose && logger.error(message);
    const hasProxies = Object.keys(models.proxies()).length > 0;
    onPurpose && hasProxies && await integrations.shell.pkill(`${APP_ID}-${ENV}`);
    await lib.sleep(1000);
    throw new Error();
};

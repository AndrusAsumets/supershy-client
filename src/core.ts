// deno-lint-ignore-file no-explicit-any

import { logger as _logger } from './logger.ts';
import * as models from './models.ts';

const { config } = models;
const {
    SCRIPT_PATH,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    SSH_USER,
    LOG_PATH,
    SSH_LOG_EXTENSION,
    APP_ID,
    ENV,
    PROXY_LOCAL_PORT,
    PROXY_REMOTE_PORT,
    ENABLE_TUN_FILE_NAME,
    DISABLE_TUN_FILE_NAME,
} = config();
import { Config, Proxy, InstanceProvider } from './types.ts';
import * as lib from './lib.ts';
import * as integrations from './integrations.ts';

const logger = _logger.get();

export const useProxy = (options: any) => {
    if (models.getInitialProxy()) {
        const proxy = { url: config().PROXY_URL };
        options.client = Deno.createHttpClient({ proxy });
    }

    return options;
};

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

// deno-lint-ignore-file no-explicit-any

import { logger as _logger } from './logger.ts';
import * as models from './models.ts';

const { config } = models;
const {
    SCRIPT_PATH,
    SSH_USER,
    LOG_PATH,
    UFW_BACKUP_PATH,
    RESOLV_CONF_BACKUP_PATH,
    SSH_LOG_EXTENSION,
    APP_ID,
    ENV,
    PROXY_LOCAL_PORT,
    PROXY_REMOTE_PORT,
} = config();
import { Config, Proxy, InstanceProvider, ClientScriptFileName } from './types.ts';
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
    return `${SCRIPT_PATH}/${ClientScriptFileName.CONNECT_SSH_TUNNEL_FILE_NAME} ${passphrase} ${instanceIp} ${SSH_USER} ${sshPort} ${PROXY_LOCAL_PORT} ${PROXY_REMOTE_PORT} ${sshKeyPath} ${sshLogPath}`;
};

export const getSshLogPath = (
    proxyUuid: string
): string =>`${LOG_PATH}/${proxyUuid}${SSH_LOG_EXTENSION}`;

export const enableConnectionKillSwitch = () => {
    const proxies = models.proxies();
    const args = Object
        .keys(proxies)
        .map((key: string) => [proxies[key].instanceIp, proxies[key].sshPort])
        .flat()
        .join(' ');
    integrations.shell.command(`bash ${SCRIPT_PATH}/${ClientScriptFileName.ENABLE_CONNECTION_KILLSWITCH_FILE_NAME} ${UFW_BACKUP_PATH} ${args}`);
};

export const disableConnectionKillSwitch = () => {
    integrations.shell.command(`bash ${SCRIPT_PATH}/${ClientScriptFileName.DISABLE_CONNECTION_KILLSWITCH_FILE_NAME} ${UFW_BACKUP_PATH}`);
};

export const enableSystemWideProxy = () => {
    const proxies = models.proxies();
    const bypasses = Object
        .keys(proxies)
        .map((key: string) => proxies[key].instanceIp)
        .join(' ');
    integrations.shell.command(`bash ${SCRIPT_PATH}/${ClientScriptFileName.ENABLE_TUN_FILE_NAME} ${PROXY_LOCAL_PORT} ${RESOLV_CONF_BACKUP_PATH} ${bypasses}`);
};

export const disableSystemWideProxy = () => {
    integrations.shell.command(`bash ${SCRIPT_PATH}/${ClientScriptFileName.DISABLE_TUN_FILE_NAME} ${RESOLV_CONF_BACKUP_PATH}`);
};

export const cleanup = async (
    instanceIdsToKeep: string[]
) => {
    const instanceProviders = Object.values(InstanceProvider);

    let index = 0;
    while (index < instanceProviders.length) {
        const instanceProvider = instanceProviders[index];

        const deletableKeyIds = await integrations.compute[instanceProvider].keys.list();
        if (deletableKeyIds) {
            await integrations.compute[instanceProvider].keys.delete(
                deletableKeyIds
                    .filter((key: any) => key.name.includes(`${APP_ID}-${ENV}`))
                    .map((key: any) => key.id)
            );
        }

        const deletableInstanceIds = await integrations.compute[instanceProvider].instances.list();
        if (deletableInstanceIds) {
            await integrations.compute[instanceProvider].instances.delete(
                deletableInstanceIds
                    .filter((instance: any) => {
                        if ('name' in instance && instance.name.includes(`${APP_ID}-${ENV}`)) return true;
                        if ('label' in instance && instance.label.includes(`${APP_ID}-${ENV}`)) return true;
                    })
                    .map((instance: any) => instance.id)
                    .filter((id: string) => !instanceIdsToKeep.includes(id))
            );
        }

        index = index + 1;
    }

    models.removeUsedProxies(instanceIdsToKeep);
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

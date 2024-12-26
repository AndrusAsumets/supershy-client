// deno-lint-ignore-file no-explicit-any

import { platform as getPlatform } from 'node:os';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { logger as _logger } from './logger.ts';
import * as models from './models.ts';
import { Config, Proxy, InstanceProvider, ClientScriptFileName, LoopStatus, Side, Plugin } from './types.ts';
import * as lib from './lib.ts';
import * as integrations from './integrations.ts';
import { plugins } from './plugins.ts';

const { config } = models;
const logger = _logger.get();

export const getAvailableScripts = (): string[][] => {
    const escapeDollarSignOperator = ['\${', '${'];

    return Object
        .keys(plugins)
        .map((pluginKey: string) => {
            const sideKey = Side.CLIENT;
            const platformKey = getPlatform();
            const sides = plugins[pluginKey];
            const platforms = sides[sideKey];
            const actions = platforms[platformKey];

            return Object
                .keys(actions)
                .map((actionKey: string) => {
                    const action = actions[actionKey];

                    return Object
                        .keys(action)
                        .map((functionKey: string) => {
                            const fileName = `${pluginKey}--${sideKey}--${platformKey}--${actionKey}--${functionKey}`;
                            const file = action[functionKey]
                                .replace(escapeDollarSignOperator[0], escapeDollarSignOperator[1]);
                            return [fileName, file];
                        });
                });
        })
        .flat()
        .flat();
};

export const getAvailablePlugins = (): Plugin[] => {
    return Object
        .keys(plugins)
        .filter((pluginKey: string) => {
            const sides = plugins[pluginKey];
            const platforms = sides[Side.CLIENT];
            const actions = platforms[getPlatform()];
            return actions;
        }) as Plugin[];
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

    return config;
};

export const prepareCloudConfig = (
    string: string,
): string => {
    const lineSeparator = '\n';
    const body = string
        .split(lineSeparator)
        .filter((line: string) => line)
        .map((line: string) => `- ${line}`)
        .join(lineSeparator);
    return `
#cloud-config
runcmd:
${body}`;
};

export const getConnectionString = (
    proxy: Proxy,
): Proxy => {
    const {
        instanceIp,
        sshPort,
        sshKeyPath,
        sshLogPath,
    } = proxy;
    /*
    proxy.connectionString = `${config().SCRIPT_PATH}/${ClientScriptFileName.CONNECT_SSH_TUNNEL_FILE_NAME} ${instanceIp} ${config().SSH_USER} ${sshPort} ${sshKeyPath} ${sshLogPath} ${config().SSHUTTLE_PID_FILE_PATH}`
        .replace('\n', '');
    */
    return proxy;
};

export const getSshLogPath = (
    proxyUuid: string
): string =>`${config().LOG_PATH}/${proxyUuid}${config().SSH_LOG_EXTENSION}`;

export const enableConnectionKillSwitch = () => {
    const proxies = models.proxies();
    const hosts = Object
        .keys(proxies)
        .map((key: string) => `${proxies[key].instanceIp}:${proxies[key].sshPort}`)
        .join(',');
    //integrations.shell.command(`bash ${config().SCRIPT_PATH}/${ClientScriptFileName.ENABLE_CONNECTION_KILLSWITCH_FILE_NAME} ${hosts}`);
};

export const disableConnectionKillSwitch = () => {
    //integrations.shell.command(`bash ${config().SCRIPT_PATH}/${ClientScriptFileName.DISABLE_CONNECTION_KILLSWITCH_FILE_NAME}`);
};

export const heartbeat = async () => {
    const hasHeartbeat = await integrations.kv.cloudflare.heartbeat();
    if (!hasHeartbeat) {
        const isLooped = config().LOOP_STATUS == LoopStatus.FINISHED;
        isLooped && await exit('Heartbeat failure');
    }
};

export const setLoopStatus = (io: Server, loopStatus: LoopStatus) => {
    models.updateConfig({...config(), LOOP_STATUS: loopStatus});
    io.emit('event', config().LOOP_STATUS);
};

export const getCurrentProxyReserve = (): string[] => {
    const currentlyReservedProxies = Object
        .keys(models.proxies())
        // Ignore used proxies.
        .filter((proxyUuid: string) => !models.proxies()[proxyUuid].connectionString);
    return currentlyReservedProxies
};

export const setCurrentProxyReserve = (io: Server) => {
    models.updateConfig({...config(), PROXY_CURRENT_RESERVE_COUNT: getCurrentProxyReserve().length });
    io.emit('/config', config());
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
                    .filter((key: any) => key.name.includes(`${config().APP_ID}-${config().ENV}`))
                    .map((key: any) => key.id)
            );
        }

        const deletableInstanceIds = await integrations.compute[instanceProvider].instances.list();
        if (deletableInstanceIds) {
            await integrations.compute[instanceProvider].instances.delete(
                deletableInstanceIds
                    .filter((instance: any) => {
                        if ('name' in instance && instance.name.includes(`${config().APP_ID}-${config().ENV}`)) return true;
                        if ('label' in instance && instance.label.includes(`${config().APP_ID}-${config().ENV}`)) return true;
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
    const proxies = models.proxies();
    !onPurpose && logger.error(message);
    const hasProxies = Object.keys(proxies).length > 0;
    onPurpose && hasProxies && await integrations.shell.pkill(`${config().APP_ID}-${config().ENV}`);
    onPurpose && Object.keys(proxies).forEach(async (proxyUuid: string) => await integrations.shell.pkill(proxyUuid));
    // Give a little time to kill the process.
    onPurpose && await lib.sleep(1000);
    throw new Error();
};

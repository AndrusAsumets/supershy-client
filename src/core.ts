// deno-lint-ignore-file no-explicit-any

import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { logger as _logger } from './logger.ts';
import * as models from './models.ts';
import { Config, Node, InstanceProvider, LoopStatus, Plugin, Side, Platform, Action, Script } from './types.ts';
import * as lib from './lib.ts';
import { plugins } from './plugins.ts';
import { integrations } from './integrations.ts';

const { config } = models;
const logger = _logger.get();

export const parseScript = (
    node: Node | null,
    pluginKey: Plugin,
    sideKey: Side,
    platformKey: Platform,
    actionKey: Action,
    scriptKey: Script
): string => {
    const escapeDollarSignOperator = ['\${', '${'];
    return plugins[pluginKey][sideKey][platformKey][actionKey][scriptKey](node)
        .replaceAll(escapeDollarSignOperator[0], escapeDollarSignOperator[1])
        .replaceAll('\t', '');
};

export const getAvailablePlugins = (): Plugin[] => {
    return Object
        .keys(plugins)
        .filter((pluginKey: string) => {
            const sides = plugins[pluginKey];
            const platforms = sides[Side.CLIENT];
            const actions = platforms[config().PLATFORM];
            return actions;
        }) as Plugin[];
};

export const setInstanceProviders = (
    config: Config
): Config => {
    config.INSTANCE_PROVIDERS = [];
    config.DIGITAL_OCEAN_API_KEY && config.INSTANCE_PROVIDERS.push(InstanceProvider.DIGITAL_OCEAN);
    config.EXOSCALE_API_KEY && config.EXOSCALE_API_SECRET && config.INSTANCE_PROVIDERS.push(InstanceProvider.EXOSCALE);
    config.HETZNER_API_KEY && config.INSTANCE_PROVIDERS.push(InstanceProvider.HETZNER);
    config.VULTR_API_KEY && config.INSTANCE_PROVIDERS.push(InstanceProvider.VULTR);
    return config;
};

const getEnabledInstanceProviders = (): InstanceProvider[] => {
    return config()
        .INSTANCE_PROVIDERS
        .filter((instanceProvider: InstanceProvider) =>
            !config().INSTANCE_PROVIDERS_DISABLED.includes(instanceProvider)
    );
};

export const setInstanceCountries = async (
    config: Config
): Promise<Config> => {
    const hasHeartbeat = await integrations.kv.cloudflare.heartbeat();
    if (!hasHeartbeat) {
        return config;
    }

    const instanceProviders = getEnabledInstanceProviders();
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

export const getEnabledPluginKey = (): Plugin | undefined => {
    const connectedNode = models.getLastConnectedNode();
    if (connectedNode && connectedNode.pluginsEnabled.length) {
        return connectedNode.pluginsEnabled[0];
    }
};

export const prepareCloudConfig = (
    string: string,
): string => {
    const lineSeparator = '\n';
    const body = string
        .replaceAll('\t', '')
        .split(lineSeparator)
        .filter((line: string) => line)
        .map((line: string) => `- ${line}`)
        .join(lineSeparator);
    return `
#cloud-config
runcmd:
${body}`;
};

export const getSshLogPath = (
    nodeUuid: string
): string =>`${config().LOG_PATH}/${nodeUuid}${config().SSH_LOG_EXTENSION}`;

export const useProxy = (options: any) => {
    const connectedNode = models.getLastConnectedNode();
    if (!connectedNode) return options;

    const pluginKey = connectedNode.pluginsEnabled[0];
    const isHttpProxy = pluginKey == Plugin.HTTP_PROXY;
    const isSocks5Proxy = pluginKey == Plugin.SOCKS5_PROXY;
    const hasNodeProtocol = isHttpProxy || isSocks5Proxy;
    if (!hasNodeProtocol) return options;

    const protocol = isHttpProxy
        ? 'http'
        : 'socks5';
    const url = `${protocol}://0.0.0.0:${connectedNode.proxyLocalPort}`;
    options.client = Deno.createHttpClient({ proxy: { url } });

    return options;
};

export const enableConnectionKillSwitch = () => {
    const pluginKey = getEnabledPluginKey();
    if (!pluginKey) return;

    const platformKey = config().PLATFORM;
    const script = parseScript(null, pluginKey, Side.CLIENT, platformKey, Action.KILLSWITCH, Script.ENABLE);

    logger.info(`Enabling connection killswitch.`);
    const nodes = models.nodes();
    const args = Object
        .keys(nodes)
        .map((key: string) => `${nodes[key].instanceIp}:${nodes[key].sshPort}`)
        .join(',');
    integrations.shell.command(script, args);
    logger.info(`Enabled connection killswitch.`);
};

export const disableConnectionKillSwitch = () => {
    const pluginKey = getEnabledPluginKey();
    if (!pluginKey) return;

    const platformKey = config().PLATFORM;
    const script = parseScript(null, pluginKey, Side.CLIENT, platformKey, Action.KILLSWITCH, Script.DISABLE);

    logger.info(`Disabling connection killswitch.`);
    integrations.shell.command(script);
    logger.info(`Disabled connection killswitch.`);
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

export const getCurrentNodeReserve = (): string[] => {
    const currentlyReservedNodes = Object
        .keys(models.nodes())
        // Ignore used nodes.
        .filter((nodeUuid: string) => !models.nodes()[nodeUuid].connectedTime);
    return currentlyReservedNodes;
};

export const setCurrentNodeReserve = (io: Server) => {
    models.updateConfig({...config(), NODE_CURRENT_RESERVE_COUNT: getCurrentNodeReserve().length });
    io.emit('/config', config());
};

export const cleanup = async (
    instanceIdsToKeep: string[] = []
) => {
    const instanceProviders = Object.values(InstanceProvider);

    let index = 0;
    while (index < instanceProviders.length) {
        const instanceProvider: InstanceProvider = instanceProviders[index];
        (await integrations.compute[instanceProvider].instances.list())
            .forEach(async(instancesList: any[]) => {
                const [instances, instanceApiBaseUrl] = instancesList;

                if (instances) {
                    const deletableInstances = instances
                        .filter((instance: any) => {
                            if ('name' in instance && instance.name.includes(`${config().APP_ID}-${config().ENV}`)) return true;
                            if ('label' in instance && instance.label.includes(`${config().APP_ID}-${config().ENV}`)) return true;
                        })
                        .map((instance: any) => String(instance.id))
                        .filter((instanceId: any) => !instanceIdsToKeep.includes(instanceId));

                    await integrations.compute[instanceProvider].instances.delete(deletableInstances, instanceApiBaseUrl);
                }
            });

        index = index + 1;
    }

    models.removeUsedNodes(instanceIdsToKeep);
};

export const exit = async (
    message: string,
    onPurpose = false
) => {
    const nodes = models.nodes();
    !onPurpose && logger.error(message);
    const hasNodes = Object.keys(nodes).length > 0;
    onPurpose && hasNodes && await integrations.shell.pkill(`${config().APP_ID}-${config().ENV}`);
    onPurpose && Object.keys(nodes).forEach(async (nodeUuid: string) => await integrations.shell.pkill(nodeUuid));
    // Give a little time to kill the process.
    onPurpose && await lib.sleep(1000);
    throw new Error();
};

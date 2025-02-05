// deno-lint-ignore-file no-explicit-any

import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { logger as _logger } from './logger.ts';
import * as models from './models.ts';
import {
    Config,
    Node,
    InstanceProvider,
    LoopStatus,
    ConnectionType,
    ConnectionStatus,
    Tunnel,
    Side,
    Platform,
    Action,
    Script,
 } from './types.ts';
import * as lib from './lib.ts';
import { tunnels } from './tunnels.ts';
import { integrations } from './integrations.ts';

const { config } = models;
const logger = _logger.get();

let heartbeatControllers: AbortController[] = [];
let heartbeatTimeouts: number[] = [];

export const parseScript = (
    node: Node | null,
    tunnelKey: Tunnel,
    sideKey: Side,
    platformKey: Platform,
    actionKey: Action,
    scriptKey: Script
): string => {
    const escapeDollarSignOperator = ['\${', '${'];
    return tunnels[tunnelKey][sideKey][platformKey][actionKey][scriptKey](node)
        .replaceAll(escapeDollarSignOperator[0], escapeDollarSignOperator[1])
        .replaceAll('\t', '');
};

export const getAvailableTunnels = (): Tunnel[] => {
    return Object
        .keys(tunnels)
        .filter((tunnelKey: string) => {
            const sides = tunnels[tunnelKey];
            const platforms = sides[Side.CLIENT];
            const actions = platforms[config().PLATFORM];
            return actions;
        }) as Tunnel[];
};

export const setInstanceProviders = (
    config: Config
): Config => {
    config.INSTANCE_PROVIDERS = [];
    config.EXOSCALE_API_KEY && config.EXOSCALE_API_SECRET && config.INSTANCE_PROVIDERS.push(InstanceProvider.EXOSCALE);
    config.HETZNER_API_KEY && config.INSTANCE_PROVIDERS.push(InstanceProvider.HETZNER);
    config.UPCLOUD_API_KEY && config.UPCLOUD_API_SECRET && config.INSTANCE_PROVIDERS.push(InstanceProvider.UPCLOUD);
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

export const getEnabledTunnelKey = (): Tunnel => {
    const connectedNode = models.getLastConnectedNode();
    if (connectedNode && connectedNode.tunnelsEnabled.length) {
        return connectedNode.tunnelsEnabled[0];
    }

    return config().TUNNELS_ENABLED[0];
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

export const resetNetworkInterfaces = async () => {
    await integrations.shell.pkill('0.0.0.0');
    await integrations.shell.command(`sudo wg-quick down ${config().WIREGUARD_CONFIG_PATH} || true`);
    await integrations.shell.command(`sudo ifconfig utun0 down || true`);
};

export const resetNetwork = async () => {
    await disableTunnelKillSwitch();
    await resetNetworkInterfaces();
};

export const useProxy = (
    options: any,
) => {
    // Deno does not automatically pick up network interface changes, hence we will refresh these manually by creating a new HTTP client for Fetch per every new request.
    options.client = Deno.createHttpClient({});

    const controller = new AbortController();
    options.signal = controller.signal;
    heartbeatControllers.push(controller);
    const connectedNode = models.getLastConnectedNode();
    if (!connectedNode) return options;

    const tunnelKey = connectedNode.tunnelsEnabled[0];
    const isConnected = config().CONNECTION_STATUS == ConnectionStatus.CONNECTED;
    const isHttpProxy = tunnelKey == Tunnel.HTTP_PROXY;
    const isSocks5Proxy = tunnelKey == Tunnel.SOCKS5_PROXY;
    const hasNodeProtocol = (isHttpProxy || isSocks5Proxy);
    if (!isConnected || !hasNodeProtocol) return options;

    const protocol = isHttpProxy
        ? 'http'
        : 'socks5';
    const url = `${protocol}://0.0.0.0:${connectedNode.proxyLocalPort}`;
    options.client = Deno.createHttpClient({ proxy: { url } });

    return options;
};

export const getConnectionStatus = {
    [ConnectionType.SSH]: async (
        node: Node
    ): Promise<boolean> => {
        const output = await Deno.readTextFile(node.sshLogPath);
        return output.includes('pledge: network');
    },
    [ConnectionType.WIREGUARD]: async (
        _: Node
    ): Promise<boolean> => {
        const output = await integrations.shell.command('sudo wg show');
        if (!output.includes('received')) {
            return false;
        }

        return String(output)
            .split('\n')
            .filter((line: string) => line.includes('transfer'))[0]
            .split('received')[0]
            .split(' ')
            .map((element: string) => Number(element))
            .filter((element: number) => element > 0)
            .length > 0;
    }
};

export const enableTunnelKillSwitch = async () => {
    const tunnelKey = getEnabledTunnelKey();
    const platformKey = config().PLATFORM;
    const script = parseScript(null, tunnelKey, Side.CLIENT, platformKey, Action.KILLSWITCH, Script.ENABLE);

    const hasConnectedNode = models.getLastConnectedNode();
    if (!hasConnectedNode) {
        return;
    }

    logger.info(`Enabling tunnel killswitch.`);
    const nodes = models.nodes();
    const args = Object
        .keys(nodes)
        .map((key: string) => `${nodes[key].instanceIp}:${nodes[key].tunnelPort}`)
        .join(',');
    await integrations.shell.command(script, args);
    logger.info(`Enabled tunnel killswitch.`);
};

export const disableTunnelKillSwitch = async () => {
    const tunnelKey = getEnabledTunnelKey();
    const platformKey = config().PLATFORM;
    const script = parseScript(null, tunnelKey, Side.CLIENT, platformKey, Action.KILLSWITCH, Script.DISABLE);

    logger.info(`Disabling tunnel killswitch.`);
    await integrations.shell.command(script);
    logger.info(`Disabled tunnel killswitch.`);
};

export const enableOrDisableTunnelKillSwitch = async () => {
    config().TUNNEL_KILLSWITCH && await enableTunnelKillSwitch();
    !config().TUNNEL_KILLSWITCH && await disableTunnelKillSwitch();
};

export const heartbeat = async (): Promise<boolean> => {
    try {
        const isAppEnabled = config().APP_ENABLED;
        const isConnected = config().CONNECTION_STATUS == ConnectionStatus.CONNECTED;
        const initialNode = models.getInitialNode();
        if (!isAppEnabled || !isConnected || !initialNode) {
            return false;
        }

        const timeout = setTimeout(() => {
            exit(null, `Heartbeat timeout of ${config().HEARTBEAT_INTERVAL_SEC} seconds exceeded.`);
        }, config().HEARTBEAT_INTERVAL_SEC * 1000);
        heartbeatTimeouts.push(timeout);

        const options = {
            method: 'GET',
        };
        const protocol = 'https://';
        const url = `${protocol}${initialNode.instanceApiBaseUrl.replace(protocol, '').split('/')[0]}`;
        await fetch(url, useProxy(options));

        clearTimeout(timeout);
        logger.info('Heartbeat.');
    }
    catch(_) {
        return false;
    }

    return true;
};

export const abortOngoingHeartbeats = () => {
    try { heartbeatControllers.forEach((controller: AbortController) => controller.abort()) }
    catch(_) { _ };
    heartbeatTimeouts.forEach((timeout: number) => clearTimeout(timeout));
    heartbeatControllers = [];
    heartbeatTimeouts = [];
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

export const cleanupCompute = async (
    instanceIdsToKeep: string[] = []
) => {
    const instanceProviders = config().INSTANCE_PROVIDERS
        .filter((instanceProvider: InstanceProvider) => !config().INSTANCE_COUNTRIES_DISABLED.includes(instanceProvider));

    let index = 0;
    while (index < instanceProviders.length) {
        const instanceProvider: InstanceProvider = instanceProviders[index];

        const instanceProviderList = await integrations.compute[instanceProvider].instances.list();
        let instanceProviderIndex = 0;
        while (instanceProviderIndex < instanceProviderList.length) {
            const [instances, instanceApiBaseUrl] = instanceProviderList[instanceProviderIndex];
            if (instances) {
                const deletableInstances = instances
                    .filter((instance: any) => {
                        if ('name' in instance && instance.name.includes(`${config().APP_ID}-${config().ENV}`)) return true;
                        if ('label' in instance && instance.label.includes(`${config().APP_ID}-${config().ENV}`)) return true;
                        if ('title' in instance && instance.title.includes(`${config().APP_ID}-${config().ENV}`)) return true;
                    })
                    .map((instance: any) => {
                        if (!('id' in instance) && instance.uuid) {
                            instance.id = instance.uuid;
                        }
                        return instance;
                    })
                    .map((instance: any) => instance && String(instance.id))
                    .filter((instanceId: any) => !instanceIdsToKeep.includes(instanceId));

                await integrations.compute[instanceProvider].instances.delete(deletableInstances, instanceApiBaseUrl);
            }

            instanceProviderIndex = instanceProviderIndex + 1;
        }

        const instanceKeyList = await integrations.compute[instanceProvider].keys.list();
        let instanceKeyIndex = 0;
        while (instanceKeyIndex < instanceKeyList.length) {
            const [keys, instanceApiBaseUrl] = instanceKeyList[instanceKeyIndex];

            if (keys) {
                const deletableKeys = keys.map((key: any) => key.id || key.name);
                await integrations.compute[instanceProvider].keys.delete(deletableKeys, instanceApiBaseUrl);
            }

            instanceKeyIndex = instanceKeyIndex + 1;
        }

        index = index + 1;
    }

    models.removeUsedNodes(instanceIdsToKeep);
};

export const restartCountDown = async (
    seconds: number
) => {
    while (seconds > 0) {
        const secondLabel = seconds > 1
            ? 'seconds'
            : 'second';
        logger.info(`Restarting application in ${seconds} ${secondLabel}.`);
        await lib.sleep(1000);
        seconds = seconds - 1;
    }
};

export const saveConfig = async (
    io: Server,
    newConfig: Config,
) => {
    const prevConfig: Config = JSON.parse(JSON.stringify(config()));
    models.updateConfig(setInstanceProviders(newConfig));

    const isInstanceProvidersDiff = prevConfig.INSTANCE_PROVIDERS.length != config().INSTANCE_PROVIDERS.length;
    const isInstanceProvidersDisabledDiff = prevConfig.INSTANCE_PROVIDERS_DISABLED.length != config().INSTANCE_PROVIDERS_DISABLED.length;
    const isTunnelKillswitchDiff = prevConfig.TUNNEL_KILLSWITCH != config().TUNNEL_KILLSWITCH;
    const isTunnelsEnabledDiff = prevConfig.TUNNELS_ENABLED[0] != config().TUNNELS_ENABLED[0];

    (isInstanceProvidersDiff || isInstanceProvidersDisabledDiff) && models.updateConfig(await setInstanceCountries(config()));
    isTunnelKillswitchDiff && enableOrDisableTunnelKillSwitch();
    isTunnelsEnabledDiff && await reset(io, '/change/tunnel', true, prevConfig.TUNNEL_KILLSWITCH);

    io.emit('/config', config());
};

export const reset = async (
    io: Server,
    message: string,
    isAppEnabled: boolean,
    isTunnelKillswitchEnabled: boolean,
) => {
    models.updateConfig({...config(), APP_ENABLED: isAppEnabled, TUNNEL_KILLSWITCH: isTunnelKillswitchEnabled});
    abortOngoingHeartbeats();
    models.clearNodes();
    await resetNetwork();
    await cleanupCompute();
    exit(io, message);
};

export const exit = (
    io: Server | null,
    message: string,
) => {
    logger.warn(message);
    models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.DISCONNECTED});
    io?.emit('/config', config());
    Deno.exit(1);
};
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
    config.DIGITAL_OCEAN_API_KEY && config.INSTANCE_PROVIDERS.push(InstanceProvider.DIGITAL_OCEAN);
    config.EXOSCALE_API_KEY && config.EXOSCALE_API_SECRET && config.INSTANCE_PROVIDERS.push(InstanceProvider.EXOSCALE);
    config.HETZNER_API_KEY && config.INSTANCE_PROVIDERS.push(InstanceProvider.HETZNER);
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

export const getEnabledTunnelKey = (): Tunnel | undefined => {
    const connectedNode = models.getLastConnectedNode();
    logger.info({connectedNode})
    if (connectedNode && connectedNode.tunnelsEnabled.length) {
        return connectedNode.tunnelsEnabled[0];
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

export const resetNetworkInterfaces = async () => {
    await integrations.shell.pkill(`${config().PROXY_LOCAL_PORT}:0.0.0.0`);
    await integrations.shell.pkill('0.0.0.0/0');
    await integrations.shell.command(`sudo wg-quick down ${config().WIREGUARD_CONFIG_PATH} || true`);
    await integrations.shell.command(`sudo ifconfig utun0 down || true`);
};

export const resetNetwork = async () => {
    disableConnectionKillSwitch();
    await resetNetworkInterfaces();
};

export const useProxy = (options: any) => {
    // Deno does not automatically pick up network interface changes, hence we will refresh these manually by creating a new HTTP client for Fetch per every new request.
    options.client = Deno.createHttpClient({});
    const connectedNode = models.getLastConnectedNode();
    if (!connectedNode) return options;

    const tunnelKey = connectedNode.tunnelsEnabled[0];
    const isHttpProxy = tunnelKey == Tunnel.HTTP_PROXY;
    const isSocks5Proxy = tunnelKey == Tunnel.SOCKS5_PROXY;
    const hasNodeProtocol = isHttpProxy || isSocks5Proxy;
    if (!hasNodeProtocol) return options;

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

export const enableConnectionKillSwitch = () => {
    const tunnelKey = getEnabledTunnelKey();
    if (!tunnelKey) return;

    const platformKey = config().PLATFORM;
    const script = parseScript(null, tunnelKey, Side.CLIENT, platformKey, Action.KILLSWITCH, Script.ENABLE);

    logger.info(`Enabling connection killswitch.`);
    const nodes = models.nodes();
    const args = Object
        .keys(nodes)
        .map((key: string) => `${nodes[key].instanceIp}:${nodes[key].tunnelPort}`)
        .join(',');
    integrations.shell.command(script, args);
    logger.info(`Enabled connection killswitch.`);
};

export const disableConnectionKillSwitch = () => {
    const tunnelKey = getEnabledTunnelKey();
    if (!tunnelKey) return;

    const platformKey = config().PLATFORM;
    const script = parseScript(null, tunnelKey, Side.CLIENT, platformKey, Action.KILLSWITCH, Script.DISABLE);

    logger.info(`Disabling connection killswitch.`);
    integrations.shell.command(script);
    logger.info(`Disabled connection killswitch.`);
};

export const heartbeat = async () => {
    const initialConnectionStatus = config().CONNECTION_STATUS;
    const hasHeartbeat = await integrations.kv.cloudflare.heartbeat();
    const isConnecting = config().CONNECTION_STATUS == ConnectionStatus.CONNECTING;
    const isConnectionStatusChange = initialConnectionStatus != config().CONNECTION_STATUS;
    !hasHeartbeat && !isConnecting && !isConnectionStatusChange && await exit('Heartbeat failure');
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

export const exit = async (
    message: string,
    onPurpose = false
) => {
    const nodes = models.nodes();
    const hasNodes = Object.keys(nodes).length > 0;

    if (onPurpose) {
        hasNodes && await integrations.shell.pkill(`${config().APP_ID}-${config().ENV}`);
        Object.keys(nodes).forEach(async (nodeUuid: string) => await integrations.shell.pkill(nodeUuid));
    }
    else {
        logger.error(message);
        await restartCountDown(config().RESTART_COUNTDOWN_SEC);
    }

    throw new Error();
};

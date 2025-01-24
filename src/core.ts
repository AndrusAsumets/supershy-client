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
    await disableConnectionKillSwitch();
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

export const enableConnectionKillSwitch = async () => {
    const tunnelKey = getEnabledTunnelKey();
    const platformKey = config().PLATFORM;
    const script = parseScript(null, tunnelKey, Side.CLIENT, platformKey, Action.KILLSWITCH, Script.ENABLE);

    logger.info(`Enabling connection killswitch.`);
    const nodes = models.nodes();
    const args = Object
        .keys(nodes)
        .map((key: string) => `${nodes[key].instanceIp}:${nodes[key].tunnelPort}`)
        .join(',');
    await integrations.shell.command(script, args);
    logger.info(`Enabled connection killswitch.`);
};

export const disableConnectionKillSwitch = async () => {
    const tunnelKey = getEnabledTunnelKey();
    const platformKey = config().PLATFORM;
    const script = parseScript(null, tunnelKey, Side.CLIENT, platformKey, Action.KILLSWITCH, Script.DISABLE);

    logger.info(`Disabling connection killswitch.`);
    await integrations.shell.command(script);
    logger.info(`Disabled connection killswitch.`);
};

export const enableOrDisableConnectionKillSwitch = async () => {
    config().CONNECTION_KILLSWITCH && await enableConnectionKillSwitch();
    !config().CONNECTION_KILLSWITCH && await disableConnectionKillSwitch();
};

export const heartbeat = async (): Promise<boolean> => {
    try {
        const isConnected = config().CONNECTION_STATUS == ConnectionStatus.CONNECTED;
        if (!isConnected) {
            return false;
        }

        const timeout = setTimeout(() => {
            exit(`Heartbeat timeout of ${config().HEARTBEAT_INTERVAL_SEC} seconds exceeded.`);
        }, config().HEARTBEAT_INTERVAL_SEC * 1000);
        heartbeatTimeouts.push(timeout);

        const options = {
            method: 'GET',
        };
        const res = await fetch(integrations.kv.cloudflare.apiBaseurl, useProxy(options));
        clearTimeout(timeout);
        await res.json();
        logger.info('Heartbeat.');
    }
    catch(_) {
        return false;
    }

    return true;
};

export const abortOngoingHeartbeats = () => {
    heartbeatControllers.forEach((controller: AbortController) => {
        try { controller.abort() }
        catch(_) { _ };
    });
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

export const cleanup = async (
    instanceIdsToKeep: string[] = []
) => {
    const instanceProviders = Object.values(InstanceProvider);

    let index = 0;
    while (index < instanceProviders.length) {
        const instanceProvider: InstanceProvider = instanceProviders[index];
        (await integrations.compute[instanceProvider].keys.list())
            .forEach(async(instancesList: any[]) => {
                const [keys, instanceApiBaseUrl] = instancesList;

                if (keys) {
                    const deletableKeys = keys.map((key: any) => key.id || key.name);
                    await integrations.compute[instanceProvider].keys.delete(deletableKeys, instanceApiBaseUrl);
                }
            });

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

    const isRestarting = config().CONNECTION_STATUS == ConnectionStatus.RESTARTING;
    if (isRestarting) {
        return;
    }

    if (onPurpose) {
        hasNodes && await integrations.shell.pkill(`${config().APP_ID}-${config().ENV}`);
        Object.keys(nodes).forEach(async (nodeUuid: string) => await integrations.shell.pkill(nodeUuid));
    }
    else {
        logger.error(message);
        models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.RESTARTING});
        await restartCountDown(config().RESTART_COUNTDOWN_SEC);
    }

    throw new Error();
};

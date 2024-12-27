// deno-lint-ignore-file no-explicit-any

import { platform as getPlatform } from 'node:os';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { existsSync } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import { logger as _logger } from './logger.ts';
import * as models from './models.ts';
import { Config, Node, InstanceProvider, LoopStatus, Plugin, Side, Action, Script } from './types.ts';
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
                            const file = action[functionKey](models.getInitialNode())
                                .replaceAll(escapeDollarSignOperator[0], escapeDollarSignOperator[1])
                                .replaceAll('\t', '');
                            return [fileName, file];
                        });
                });
        })
        .flat()
        .flat();
};

export const getScriptFileName = (
    pluginKey: string,
    side: Side,
    action: Action,
    script: Script,
): string => {
    return `${pluginKey}--${side}--${getPlatform()}--${action}--${script}`;
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

export const getEnabledPluginKey = (): Plugin | undefined => {
    const connectedNode = models.getLastConnectedNode();
    return connectedNode.pluginsEnabled[0];
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

export const getConnectionString = (
    node: Node,
    scriptFileName: string,
): Node => {
    const {
        instanceIp,
        sshPort,
        sshKeyPath,
        sshLogPath,
        proxyLocalPort,
        proxyRemotePort,
    } = node;
    node.connectionString = `bash ${config().SCRIPT_PATH}/${scriptFileName} ${instanceIp} ${config().SSH_USER} ${sshPort} ${sshKeyPath} ${sshLogPath} ${config().SSHUTTLE_PID_FILE_PATH} ${proxyLocalPort} ${proxyRemotePort}`
        .replace('\n', '');
    return node;
};

export const getSshLogPath = (
    nodeUuid: string
): string =>`${config().LOG_PATH}/${nodeUuid}${config().SSH_LOG_EXTENSION}`;

export const useProxy = (options: any) => {
    const connectedNode = models.getLastConnectedNode();
    if (!connectedNode) return options;

    const pluginKey = connectedNode.pluginsEnabled[0];
    const hasNodeProtocol = pluginKey.includes('proxy');
    if (!hasNodeProtocol) return options;

    const protocol = pluginKey.split('_')[0];
    const url = `${protocol}://0.0.0.0:${connectedNode.proxyLocalPort}`;
    options.client = Deno.createHttpClient({ proxy: { url } });

    return options;
};

export const enableConnectionKillSwitch = () => {
    const pluginKey = getEnabledPluginKey();
    if (!pluginKey) return;

    const fileName = getScriptFileName(pluginKey, Side.CLIENT, Action.KILLSWITCH, Script.ENABLE);
    const filePath = `${config().SCRIPT_PATH}/${fileName}`;
    const hasFile = existsSync(filePath);
    if (!hasFile) return;

    logger.info(`Enabling connection killswitch.`);
    const nodes = models.nodes();
    const hosts = Object
        .keys(nodes)
        .map((key: string) => `${nodes[key].instanceIp}:${nodes[key].sshPort}`)
        .join(',');
    integrations.shell.command(`bash ${filePath} ${hosts}`);
    logger.info(`Enabled connection killswitch.`);
};

export const disableConnectionKillSwitch = () => {
    const pluginKey = getEnabledPluginKey();
    if (!pluginKey) return;

    const fileName = getScriptFileName(pluginKey, Side.CLIENT, Action.KILLSWITCH, Script.DISABLE);
    const filePath = `${config().SCRIPT_PATH}/${fileName}`;
    const hasFile = existsSync(filePath);
    if (!hasFile) return;

    logger.info(`Disabling connection killswitch.`);
    integrations.shell.command(`bash ${filePath}`);
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
        .filter((nodeUuid: string) => !models.nodes()[nodeUuid].connectionString);
    return currentlyReservedNodes;
};

export const setCurrentNodeReserve = (io: Server) => {
    models.updateConfig({...config(), NODE_CURRENT_RESERVE_COUNT: getCurrentNodeReserve().length });
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

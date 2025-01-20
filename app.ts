import * as crypto from 'node:crypto';
import { v7 as uuidv7 } from 'npm:uuid';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { open } from 'https://deno.land/x/open@v1.0.0/index.ts';
import { existsSync } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import {
    LoopStatus,
    ConnectionType,
    ConnectionStatus,
    NodeType,
    Node,
    InstanceProvider,
    InstancePayload,
    Action,
    Side,
    Platform,
    Script,
} from './src/types.ts';
import * as core from './src/core.ts';
import * as models from './src/models.ts';
import * as webserver from './src/webserver.ts';
import * as websocket from './src/websocket.ts';
import { logger as _logger } from './src/logger.ts';
import * as lib from './src/lib.ts';
import { plugins } from './src/plugins.ts';
import { integrations } from './src/integrations.ts';
const { config } = models;
const io = new Server({ cors: { origin: '*' }});
const logger = _logger.get(io);

const init = () => {
    integrations.fs.ensureFolder(config().DATA_PATH);
    integrations.fs.ensureFolder(config().SSH_PATH);
    integrations.fs.ensureFolder(config().KEY_PATH);
    integrations.fs.ensureFolder(config().LOG_PATH);
    !existsSync(config().SSH_KNOWN_HOSTS_PATH) && Deno.writeTextFileSync(config().SSH_KNOWN_HOSTS_PATH, '');
    loop();
    core.heartbeat();
    setInterval(() => core.heartbeat(), config().HEARTBEAT_INTERVAL_SEC * 1000);
};

const connect = {
    [ConnectionType.SSH]: async (
        node: Node,
    ) => {
        logger.info(`Using plugin ${node.pluginsEnabled[0]} while connecting to ${node.instanceIp}:${node.serverPort} via ${node.connectionType}.`);

        const platformKey = config().PLATFORM;
        const script = core.parseScript(node, node.pluginsEnabled[0], Side.CLIENT, platformKey, Action.MAIN, Script.ENABLE);
        integrations.kv.cloudflare.key.write(node);
        existsSync(node.sshLogPath) && Deno.removeSync(node.sshLogPath);
        config().CONNECTION_KILLSWITCH && core.enableConnectionKillSwitch();

        models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTING});
        io.emit('/config', config());

        while (config().CONNECTION_STATUS != ConnectionStatus.CONNECTED) {
            await integrations.shell.pkill(`${config().PROXY_LOCAL_PORT}:0.0.0.0`);
            await integrations.shell.pkill('0.0.0.0/0');
            await lib.sleep(1000);
            await integrations.shell.command(script);
            await lib.sleep(config().SSH_CONNECTION_TIMEOUT_SEC * 1000);

            try {
                const output = Deno.readTextFileSync(node.sshLogPath);
                const hasNetwork = output.includes('pledge: network');

                if (hasNetwork) {
                    logger.info(`Connected to ${node.instanceIp}:${node.serverPort}.`);
                    node.connectedTime = new Date().toISOString();
                    models.updateNode(node);
                    models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTED});
                    core.setCurrentNodeReserve(io);
                    io.emit('/node', node);
                    io.emit('/config', config());
                }
            }
            catch(err) {
                logger.warn({ message: `Failed to connect to ${node.instanceIp}:${node.serverPort}.`, err });
            }
        }
    },
    [ConnectionType.WIREGUARD]: async (
        node: Node,
    ) => {
        config().CONNECTION_KILLSWITCH && core.enableConnectionKillSwitch();

        logger.info(`Using plugin ${node.pluginsEnabled[0]} while connecting to ${node.instanceIp}:${node.serverPort} via ${node.connectionType}.`);

        models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTING});
        io.emit('/config', config());

        const platformKey = config().PLATFORM;
        const script = core.parseScript(node, node.pluginsEnabled[0], Side.CLIENT, platformKey, Action.MAIN, Script.ENABLE);
        await integrations.shell.command(script);

        while (config().CONNECTION_STATUS != ConnectionStatus.CONNECTED) {
            await lib.sleep(config().SSH_CONNECTION_TIMEOUT_SEC * 1000);

            try {
                const wireguard = await integrations.shell.command('sudo wg show');
                if (!wireguard.includes('transfer')) {
                    await lib.sleep(1000);
                    continue;
                }

                const hasNetwork = wireguard
                    .split('\n')
                    .filter((line: string) => line.includes('transfer'))[0]
                    .split('received')[0]
                    .split(' ')
                    .map((element: string) => Number(element))
                    .filter((element: number) => element > 0)
                    .length;

                if (hasNetwork) {
                    logger.info(`Connected to ${node.instanceIp}:${node.serverPort}.`);
                    node.connectedTime = new Date().toISOString();
                    models.updateNode(node);
                    models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTED});
                    core.setCurrentNodeReserve(io);
                    io.emit('/node', node);
                    io.emit('/config', config());
                }
                else {
                    await lib.sleep(1000);
                }
            }
            catch(err) {
                await lib.sleep(1000);
                logger.warn({ message: `Failed to connect to ${node.instanceIp}:${node.serverPort}.`, err });
            }
        }
    }
};

const loop = async () => {
    setTimeout(async () => {
        const isStillWorking = config().LOOP_STATUS == LoopStatus.ACTIVE;
        isStillWorking
            ? await core.exit(`Timeout after passing ${config().NODE_RECYCLE_INTERVAL_SEC} seconds.`)
            : await loop();
    }, config().NODE_RECYCLE_INTERVAL_SEC * 1000);

    try {
        core.setLoopStatus(io, LoopStatus.ACTIVE);
        const startTime = performance.now();
        logger.info('Started node rotation.');
        await rotate();
        const endTime = performance.now();
        core.setLoopStatus(io, LoopStatus.FINISHED);

        logger.info(
            `Node rotation finished in ${
                Number((endTime - startTime) / 1000).toFixed(0)
            } seconds.`,
        );
    } catch (err) {
        logger.error(err);
        await core.exit('Loop failure.');
    }
};

const rotate = async () => {
    const activeNodes: Node[] = [];
    const initialNode = models.getInitialNode();
    const nodeTypes: NodeType[] = !initialNode
        ? config().NODE_TYPES
        : [];

    if (initialNode) {
        await connect[initialNode.connectionType](initialNode);
        activeNodes.push(initialNode);
        const nodeCurrentReserveCount = core.getCurrentNodeReserve().length;
         // Cant reserve negative nodes.
        const nodesToReserve = config().NODE_RESERVE_COUNT - nodeCurrentReserveCount >= 0
            ? config().NODE_RESERVE_COUNT - nodeCurrentReserveCount
            : 0;
        // Prepare enough nodes for the reserve.
        [...Array(nodesToReserve).keys()].map(() => nodeTypes.push(NodeType.A));
        // Mark down active nodes, so we would know which ones to keep from being deleted.
        core.getCurrentNodeReserve().map(
            (nodeUuid: string) => activeNodes.push(models.nodes()[nodeUuid]
        ));
    }

    let nodeIndex = 0;
    while (nodeIndex < nodeTypes.length) {
        const instanceProviders = config().INSTANCE_PROVIDERS
            .filter((instanceProvider: InstanceProvider) => !config().INSTANCE_PROVIDERS_DISABLED.includes(instanceProvider));
        !instanceProviders.length && logger.warn('None of the VPS providers are enabled.');
        const instanceProvider: InstanceProvider = lib.shuffle(instanceProviders)[0];
        const { instanceSize, instanceImage } = integrations.compute[instanceProvider];
        const enabledPluginKey = config().PLUGINS_ENABLED[0];
        !enabledPluginKey && logger.info(`No enabled plugins found.`);
        const connectionType = enabledPluginKey.toLowerCase().includes('wireguard')
            ? ConnectionType.WIREGUARD
            : ConnectionType.SSH;
        const nodeUuid = uuidv7();
        const sshUser = crypto.randomBytes(16).toString('hex');
        const nodeType = nodeTypes[nodeIndex];
        const instanceName = `${config().APP_ID}-${config().ENV}-${nodeType}-${nodeUuid}`;
        const clientKeyPath = `${config().KEY_PATH}/${nodeUuid}`;
        const serverPortRange: number[] = config().SERVER_PORT_RANGE.split(':').map((item: string) => Number(item));
        const serverPort = lib.randomNumberFromRange(serverPortRange);
        const jwtSecret = crypto.randomBytes(64).toString('hex');
        let node: Node = {
            nodeUuid,
            proxyLocalPort: config().PROXY_LOCAL_PORT,
            proxyRemotePort: config().PROXY_REMOTE_PORT,
            appId: config().APP_ID,
            pluginsEnabled: [enabledPluginKey],
            connectionType,
            instanceProvider,
            instanceApiBaseUrl: '',
            instanceName,
            instanceId: '',
            instanceIp: '',
            instanceRegion: '',
            instanceCountry: '',
            instanceSize,
            instanceImage,
            nodeType,
            sshUser,
            serverPublicKey: '',
            sshKeyAlgorithm: config().SSH_KEY_ALGORITHM,
            sshKeyLength: config().SSH_KEY_LENGTH,
            clientKeyPath,
            serverPort,
            jwtSecret,
            sshLogPath: core.getSshLogPath(nodeUuid),
            isDeleted: false,
            connectedTime: null,
            createdTime: new Date().toISOString(),
            modifiedTime: null,
            deletedTime: null,
        };
        const instanceLocationsList = await integrations.compute[instanceProvider].regions.parse();
        !instanceLocationsList.length && logger.info('No locations were found. Are any of the countries enabled for the VPS?');
        const [instanceRegion, instanceCountry, instanceApiBaseUrl]: string[] = lib.shuffle(instanceLocationsList)[0];
        node = {...node, instanceRegion, instanceCountry, instanceApiBaseUrl};
        const [publicSshKey] = await integrations.shell.keygen(node, Script.PREPARE);
        const instancePublicKeyId = await integrations.compute[instanceProvider].keys.add(node, publicSshKey, instanceName);
        const script = plugins[enabledPluginKey][Side.SERVER][Platform.LINUX][Action.MAIN][Script.ENABLE](node);
        const userData = core.prepareCloudConfig(script);
        const formattedUserData = integrations.compute[instanceProvider].userData.format(userData);
        const instancePayload: InstancePayload = {
            datacenter: instanceRegion,
            region: instanceRegion,
            image: instanceImage,
            os_id: -1,
            name: instanceName,
            label: instanceName,
            size: instanceSize,
            'instance-type': {},
            plan: instanceSize,
            server_type: instanceSize,
            ssh_keys: [instancePublicKeyId],
            sshkey_id: [instancePublicKeyId],
            'ssh-key': { name: instancePublicKeyId },
            user_data: formattedUserData,
            'user-data': formattedUserData,
            user_scheme: 'root',
            backups: 'disabled',
            'public-ip-assignment': 'inet4',
            enable_ipv6: false,
            disable_public_ipv4: false,
            'security-groups': [],
            'template': {},
            'disk-size': config().EXOSCALE_DISK_SIZE,
        };
        logger.info(`Creating ${instanceProvider} instance.`);
        logger.info(instancePayload);

        node = {
            ...node,
            ...await integrations.compute[instanceProvider].instances.create(node, instancePayload)
        };

        logger.info(`Created ${instanceProvider} instance.`);
        logger.info(`Found network at ${node.instanceIp}.`);

        node.serverPublicKey = await integrations.kv.cloudflare.key.read(node, jwtSecret);
        models.updateNode(node);
        activeNodes.push(node);
        core.setCurrentNodeReserve(io);
        await integrations.compute[instanceProvider].keys.delete(node, instancePublicKeyId);
        nodeIndex = nodeIndex + 1;
    }

    !initialNode && await connect[activeNodes[0].connectionType](activeNodes[0]);
    await core.cleanup(activeNodes.map(node => node.instanceId));
};

models.updateConfig({
    ...config(),
    LOOP_STATUS: LoopStatus.INACTIVE,
    CONNECTION_STATUS: ConnectionStatus.DISCONNECTED,
    PLUGINS: core.getAvailablePlugins()
});
webserver.start();
websocket.start(io);
config().AUTO_LAUNCH_WEB && open(config().WEB_URL);
config().AUTO_LAUNCH_WEB && models.updateConfig({...config(), AUTO_LAUNCH_WEB: false});
config().NODE_ENABLED && init();
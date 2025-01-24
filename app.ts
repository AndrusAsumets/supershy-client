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
import { tunnels } from './src/tunnels.ts';
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

const connect = async (
    node: Node,
) => {
    logger.info(`Using tunnel ${node.tunnelsEnabled[0]} while connecting to ${node.instanceIp}:${node.tunnelPort} via ${node.connectionType}.`);

    integrations.kv.cloudflare.key.write(node);
    existsSync(node.sshLogPath) && Deno.removeSync(node.sshLogPath);
    config().CONNECTION_KILLSWITCH && core.enableConnectionKillSwitch();
    !config().CONNECTION_KILLSWITCH && core.disableConnectionKillSwitch();
    await core.resetNetworkInterfaces();

    models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTING});
    io.emit('/config', config());

    const connectTimeout = setTimeout(() => {
        core.exit(`Connect timeout of ${config().CONNECT_TIMEOUT_SEC} seconds exceeded.`);
    }, config().CONNECT_TIMEOUT_SEC * 1000);

    const script = core.parseScript(node, node.tunnelsEnabled[0], Side.CLIENT, config().PLATFORM, Action.MAIN, Script.ENABLE);
    await integrations.shell.command(script);

    models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTING});
    core.abortOngoingHeartbeats();
    io.emit('/config', config());

    while (config().CONNECTION_STATUS != ConnectionStatus.CONNECTED) {
        try {
            const isConnected = await core.getConnectionStatus[node.connectionType](node);
            if (!isConnected) {
                await lib.sleep(1000);
                continue;
            }

            clearTimeout(connectTimeout);
            node.connectedTime = new Date().toISOString();
            models.updateNode(node);
            models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTED});
            core.setCurrentNodeReserve(io);
            io.emit('/node', node);
            io.emit('/config', config());
            logger.info(`Connected to ${node.instanceIp}:${node.tunnelPort}.`);
            await lib.sleep(config().DNS_PICKUP_DELAY_SEC * 1000);
        }
        catch(err) {
            await lib.sleep(1000);
            logger.warn({ message: `Failed to connect to ${node.instanceIp}:${node.tunnelPort}.`, err });
        }
    }
};

const loop = async () => {
    setTimeout(async () => {
        const isRestarting = config().CONNECTION_STATUS == ConnectionStatus.RESTARTING;
        if (isRestarting) {
            return;
        }

        const isStillWorking = config().LOOP_STATUS == LoopStatus.ACTIVE;
        isStillWorking
            ? await core.exit(`Node rotation timeout reached after passing ${config().NODE_RECYCLE_INTERVAL_SEC} seconds.`)
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
        await connect(initialNode);
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
        const enabledTunnelKey = config().TUNNELS_ENABLED[0];
        !enabledTunnelKey && logger.info(`No enabled tunnels found.`);
        const connectionType = enabledTunnelKey.toLowerCase().includes('wireguard')
            ? ConnectionType.WIREGUARD
            : ConnectionType.SSH;
        const nodeUuid = uuidv7();
        const sshUser = crypto.randomBytes(16).toString('hex');
        const nodeType = nodeTypes[nodeIndex];
        const instanceName = `${config().APP_ID}-${config().ENV}-${nodeType}-${nodeUuid}`;
        const clientKeyPath = `${config().KEY_PATH}/${nodeUuid}`;
        const tunnelPortRange: number[] = config().TUNNEL_PORT_RANGE.split(':').map((item: string) => Number(item));
        const tunnelPort = lib.randomNumberFromRange(tunnelPortRange);
        const jwtSecret = crypto.randomBytes(64).toString('hex');
        let node: Node = {
            nodeUuid,
            proxyLocalPort: config().PROXY_LOCAL_PORT,
            proxyRemotePort: config().PROXY_REMOTE_PORT,
            appId: config().APP_ID,
            tunnelsEnabled: [enabledTunnelKey],
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
            tunnelPort,
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
        const script = tunnels[enabledTunnelKey][Side.SERVER][Platform.LINUX][Action.MAIN][Script.ENABLE](node);
        const userData = core.prepareCloudConfig(script);
        const formattedUserData = integrations.compute[instanceProvider].userData.format(userData);
        const instancePayload: InstancePayload = {
            datacenter: instanceRegion,
            region: instanceRegion,
            image: instanceImage,
            name: instanceName,
            size: instanceSize,
            'instance-type': {},
            server_type: instanceSize,
            ssh_keys: [instancePublicKeyId],
            'ssh-key': { name: instancePublicKeyId },
            user_data: formattedUserData,
            'user-data': formattedUserData,
            'public-ip-assignment': 'inet4',
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

    !initialNode && await connect(activeNodes[0]);
    await core.cleanup(activeNodes.map(node => node.instanceId));
};

models.updateConfig({
    ...config(),
    LOOP_STATUS: LoopStatus.INACTIVE,
    CONNECTION_STATUS: ConnectionStatus.DISCONNECTED,
    TUNNELS: core.getAvailableTunnels()
});
webserver.start();
websocket.start(io);
config().AUTO_LAUNCH_WEB && open(config().WEB_URL);
config().AUTO_LAUNCH_WEB && models.updateConfig({...config(), AUTO_LAUNCH_WEB: false});
config().NODE_ENABLED && init();
import * as crypto from 'node:crypto';
import { v7 as uuidv7 } from 'npm:uuid';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { existsSync } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import dns from 'node:dns/promises';
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
): Promise<Node> => {
    const isWireguard = node.connectionType == ConnectionType.WIREGUARD;
    logger.info(`Using ${node.tunnelsEnabled[0]} tunnel while connecting to ${node.instanceIp}:${node.tunnelPort} via ${node.connectionType}.`);

    config().TUNNEL_KILLSWITCH && await core.enableTunnelKillSwitch();
    integrations.kv.cloudflare.key.write(node);
    existsSync(node.sshLogPath) && Deno.removeSync(node.sshLogPath);
    await core.resetNetworkInterfaces();

    models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTING});
    io.emit('/config', config());

    const connectTimeout = setTimeout(() => {
        core.exit(io, `Connect timeout of ${config().CONNECT_TIMEOUT_SEC} seconds exceeded.`);
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

            // It might take a bit for Deno to catch up with the network interface change, therefore we have a wee break.
            if (isWireguard) {
                dns.setServers([node.wireguardHost]);
                await lib.sleep(config().POST_CONNECT_DELAY_SEC * 1000);
            }
        }
        catch(err) {
            await lib.sleep(1000);
            logger.warn({ message: `Failed to connect to ${node.instanceIp}:${node.tunnelPort}.`, err });
        }
    }

    return node;
};

const loop = async () => {
    const nodeRecycleIntervalSec = config().NODE_RECYCLE_INTERVAL_SEC;
    setTimeout(async () => {
        const isStillWorking = config().LOOP_STATUS == LoopStatus.ACTIVE;
        isStillWorking
            ? core.exit(io, `Node rotation timeout reached after passing ${nodeRecycleIntervalSec} seconds.`)
            : await loop();
    }, nodeRecycleIntervalSec * 1000);

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
        core.exit(io, 'Loop failure.');
    }
};

const rotate = async () => {
    const activeNodes: Node[] = [];
    let initialNode = models.getInitialNode();
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
        const { instanceSize } = integrations.compute[instanceProvider];
        const instanceImage = await integrations.compute[instanceProvider].getInstanceImage();
        const tunnelKey = config().TUNNELS_ENABLED[0];
        const connectionType = tunnelKey.toLowerCase().includes('wireguard')
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
            tunnelsEnabled: [tunnelKey],
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
            wireguardHost: config().WIREGUARD_HOST,
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
        const script = tunnels[tunnelKey][Side.SERVER][Platform.LINUX][Action.MAIN][Script.ENABLE](node);
        const userData = core.prepareCloudConfig(script);
        const formattedUserData = integrations.compute[instanceProvider].userData.format(userData);
        const loginUser = {
            username: 'root',
            ssh_keys: {
                ssh_key: [publicSshKey]
            }
        };
        const networking = {
            interfaces: {
                interface: [
                    {
                        ip_addresses: {
                            ip_address: [
                                {
                                    family: 'IPv4'
                                }
                            ]
                        },
                        type: 'public'
                    },
                ]
            }
        };
        const storageDevices = {
            storage_device: [
                {
                    action: 'clone',
                    storage: instanceImage,
                    title: instanceName
                }
            ]
        };
        const instancePayload: InstancePayload = {
            datacenter: instanceRegion,
            zone: instanceRegion,
            image: instanceImage,
            title: instanceName,
            name: instanceName,
            'instance-type': {},
            server_type: instanceSize,
            plan: instanceSize,
            'ssh-key': { name: instancePublicKeyId },
            ssh_keys: [instancePublicKeyId],
            user_data: formattedUserData,
            'user-data': formattedUserData,
            login_user: loginUser,
            'public-ip-assignment': 'inet4',
            'security-groups': [],
            'template': {},
            'disk-size': config().EXOSCALE_DISK_SIZE,
            firewall: 'off',
            hostname: 'host.name',
            metadata: 'yes',
            networking,
            simple_backup: 'no',
            storage_devices: storageDevices,
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
        if (!initialNode) {
            initialNode = await connect(node);
        }
        nodeIndex = nodeIndex + 1;
    }

    await core.cleanupCompute(activeNodes.map(node => node.instanceId));
};

models.updateConfig({
    ...config(),
    LOOP_STATUS: LoopStatus.INACTIVE,
    CONNECTION_STATUS: ConnectionStatus.DISCONNECTED,
    TUNNELS: core.getAvailableTunnels()
});
await core.resetNetworkInterfaces();
webserver.start();
websocket.start(io);
!config().TUNNEL_KILLSWITCH && await core.disableTunnelKillSwitch();
config().APP_ENABLED && init();
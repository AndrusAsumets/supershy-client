// deno-lint-ignore-file no-explicit-any

import * as crypto from 'node:crypto';
import { v7 as uuidv7 } from 'npm:uuid';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { open } from 'https://deno.land/x/open@v1.0.0/index.ts';
import { existsSync } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import {
    LoopStatus,
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
import * as integrations from './src/integrations.ts';
import { plugins } from "./src/plugins.ts";

const { config } = models;
const io = new Server({ cors: { origin: '*' }});
const logger = _logger.get(io);

const init = () => {
    integrations.fs.ensureFolder(config().DATA_PATH);
    integrations.fs.ensureFolder(config().SCRIPT_PATH);
    integrations.fs.ensureFolder(config().SSH_PATH);
    integrations.fs.ensureFolder(config().SSH_KEY_PATH);
    integrations.fs.ensureFolder(config().LOG_PATH);

    !existsSync(config().SSH_KNOWN_HOSTS_PATH) && Deno.writeTextFileSync(config().SSH_KNOWN_HOSTS_PATH, '');

    const scripts: string[][] = core.getAvailableScripts();
    scripts.forEach((script: string[]) => {
        const [fileName, file] = script;
        Deno.writeTextFileSync(`${config().SCRIPT_PATH}/${fileName}`, file);
        new Deno.Command('chmod', { args: ['+x', fileName] });
        Deno.chmodSync(`${config().SCRIPT_PATH}/${fileName}`, 0o700);
    });

    loop();
    core.heartbeat();
    setInterval(() => core.heartbeat(), config().HEARTBEAT_INTERVAL_SEC);
};

const connect = async (
    node: Node,
) => {
    const initialNode = models.getInitialNode();
    const mainEnableFileName = core.getScriptFileName(node.pluginsEnabled[0], Side.CLIENT, Action.MAIN, Script.ENABLE);
    node = core.getConnectionString(node, mainEnableFileName);
    integrations.fs.hostKey.save(node);
    existsSync(node.sshLogPath) && Deno.removeSync(node.sshLogPath);
    (config().CONNECTION_KILLSWITCH && initialNode) && core.enableConnectionKillSwitch();

    logger.info(`Connecting SSH to ${node.instanceIp}:${node.sshPort}.`);
    models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTING});
    io.emit('/config', config());

    while (config().CONNECTION_STATUS != ConnectionStatus.CONNECTED) {
        await integrations.shell.pkill(`${config().PROXY_LOCAL_PORT}:0.0.0.0`);
        await integrations.shell.pkill('0.0.0.0/0');
        await lib.sleep(1000);
        integrations.shell.command(node.connectionString);
        await lib.sleep(config().SSH_CONNECTION_TIMEOUT_SEC * 1000);

        try {
            const output = Deno.readTextFileSync(node.sshLogPath);
            const hasNetwork = output.includes('pledge: network');

            if (hasNetwork) {
                logger.info(`Connected SSH to ${node.instanceIp}:${node.sshPort}.`);
                node.connectedTime = new Date().toISOString();
                models.updateNode(node);
                models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTED});
                io.emit('/config', config());
            }
        }
        catch(err) {
            logger.warn({ message: `Restarting SSH connect to ${node.instanceIp}:${node.sshPort}.`, err });
        }
    }

    // If we started from scratch, then enable it for that too.
    (config().CONNECTION_KILLSWITCH && !initialNode) && core.enableConnectionKillSwitch();
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
        await rotate();
        logger.info('Started node rotation.');
        const endTime = performance.now();
        core.setLoopStatus(io, LoopStatus.FINISHED);

        logger.info(
            `Node rotation finished in ${
                Number((endTime - startTime) / 1000).toFixed(0)
            } seconds.`,
        );
    } catch (err) {
        await core.exit(`Loop failure: ${err}`);
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
        io.emit('/node', initialNode);
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
        core.setCurrentNodeReserve(io);
    }

    let nodeIndex = 0;
    while (nodeIndex < nodeTypes.length) {
        const instanceProviders = config().INSTANCE_PROVIDERS
            .filter((instanceProvider: InstanceProvider) => !config().INSTANCE_PROVIDERS_DISABLED.includes(instanceProvider));
        !instanceProviders.length && logger.warn('None of the VPS providers are enabled.');
        const instanceProvider: InstanceProvider = lib.shuffle(instanceProviders)[0];
        const enabledPluginKey = config().PLUGINS_ENABLED[0];
        !enabledPluginKey && logger.info(`No enabled plugins found.`);
        const nodeUuid = uuidv7();
        const nodeType = nodeTypes[nodeIndex];
        const instanceLocationsList = await integrations.compute[instanceProvider].regions.parse();
        !instanceLocationsList.length && logger.info('No locations were found. Are any of the countries enabled for the VPS?');
        const [instanceRegion, instanceCountry]: string[] = lib.shuffle(instanceLocationsList)[0];
        const instanceName = `${config().APP_ID}-${config().ENV}-${nodeType}-${nodeUuid}`;
        const { instanceSize, instanceImage } = integrations.compute[instanceProvider];
        const sshKeyPath = `${config().SSH_KEY_PATH}/${instanceName}`;
        const sshPortRange: number[] = config().SSH_PORT_RANGE.split(':').map((item: string) => Number(item));
        const sshPort = lib.randomNumberFromRange(sshPortRange);
        const jwtSecret = crypto.randomBytes(64).toString('hex');
        let node: Node = {
            nodeUuid,
            proxyLocalPort: config().PROXY_LOCAL_PORT,
            proxyRemotePort: config().PROXY_REMOTE_PORT,
            appId: config().APP_ID,
            pluginsEnabled: [enabledPluginKey],
            instanceProvider,
            instanceName,
            instanceId: '',
            instanceIp: '',
            instanceRegion,
            instanceCountry,
            instanceSize,
            instanceImage,
            instancePublicKeyId: '',
            nodeType,
            sshUser: config().SSH_USER,
            sshHostKey: '',
            sshKeyAlgorithm: config().SSH_KEY_ALGORITHM,
            sshKeyLength: config().SSH_KEY_LENGTH,
            sshKeyPath,
            sshPort,
            jwtSecret,
            sshLogPath: core.getSshLogPath(nodeUuid),
            connectionString: '',
            isDeleted: false,
            connectedTime: null,
            createdTime: new Date().toISOString(),
            modifiedTime: null,
            deletedTime: null,
        };
        const publicKey = await integrations.shell.privateKey.create(node);
        node.instancePublicKeyId = await integrations.compute[instanceProvider].keys.add(publicKey, instanceName);
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
            plan: instanceSize,
            server_type: instanceSize,
            ssh_keys: [node.instancePublicKeyId],
            sshkey_id: [node.instancePublicKeyId],
            user_data: formattedUserData,
            backups: 'disabled',
        };
        const { instanceId, instanceIp } = await integrations.compute[instanceProvider].instances.create(instancePayload);
        node.instanceId = instanceId;
        node.instanceIp = instanceIp;

        logger.info(`Created ${instanceProvider} instance.`);
        logger.info(instancePayload);
        logger.info(`Found network at ${instanceIp}.`);

        node = await integrations.kv.cloudflare.hostKey.get(node, jwtSecret);
        models.updateNode(node);
        activeNodes.push(node);
        core.setCurrentNodeReserve(io);
        nodeIndex = nodeIndex + 1;
    }

    !initialNode && await connect(activeNodes[0]);
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
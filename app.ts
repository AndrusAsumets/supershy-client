// deno-lint-ignore-file no-explicit-any

import * as crypto from 'node:crypto';
import { v7 as uuidv7 } from 'npm:uuid';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { open } from 'https://deno.land/x/open@v1.0.0/index.ts';
import { existsSync } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import {
    LoopStatus,
    ProxyType,
    Proxy,
    InstanceProvider,
    CreateDigitalOceanInstance,
    CreateHetznerInstance,
    CreateVultrInstance,
    ClientScriptFileName,
} from './src/types.ts';
import * as core from './src/core.ts';
import * as models from './src/models.ts';
import * as webserver from './src/webserver.ts';
import * as websocket from './src/websocket.ts';
import { logger as _logger } from './src/logger.ts';
import * as lib from './src/lib.ts';
import * as integrations from './src/integrations.ts';
const { config } = models;

import { clientScripts } from './src/client-scripts.ts';
import * as serverScripts from './src/server-scripts.ts';

const io = new Server({ cors: { origin: '*' }});
const logger = _logger.get(io);

let loopStatus: LoopStatus = LoopStatus.INACTIVE;

const init = () => {
    integrations.fs.ensureFolder(config().DATA_PATH);
    integrations.fs.ensureFolder(config().BACKUP_PATH);
    integrations.fs.ensureFolder(config().SCRIPT_PATH);
    integrations.fs.ensureFolder(config().SSH_PATH);
    integrations.fs.ensureFolder(config().SSH_KEY_PATH);
    integrations.fs.ensureFolder(config().LOG_PATH);

    !existsSync(config().SSH_KNOWN_HOSTS_PATH) && Deno.writeTextFileSync(config().SSH_KNOWN_HOSTS_PATH, '');

    Object.keys(clientScripts).forEach((fileName: string) => {
        const file = clientScripts[fileName as ClientScriptFileName];
        Deno.writeTextFileSync(`${config().SCRIPT_PATH}/${fileName}`, file);
        new Deno.Command('chmod', { args: ['+x', fileName] });
        Deno.chmodSync(`${config().SCRIPT_PATH}/${fileName}`, 0o700);
    });

    loop();
    heartbeat();
    setInterval(() => heartbeat(), config().HEARTBEAT_INTERVAL_SEC);
};

const connect = async (
    proxy: Proxy,
) => {
    const port = config().PROXY_LOCAL_PORT;
    proxy.connectionString = core.getConnectionString(proxy)

    integrations.fs.hostKey.save(proxy);
    existsSync(proxy.sshLogPath) && Deno.removeSync(proxy.sshLogPath);

    if (config().CONNECTION_KILLSWITCH && models.getInitialProxy()) {
        logger.info(`Enabling connection killswitch.`);
        core.enableConnectionKillSwitch();
        logger.info(`Enabled connection killswitch.`);
    }

    if (config().PROXY_SYSTEM_WIDE && models.getInitialProxy()) {
        logger.info(`Enabling system-wide proxy via tun2proxy.`);
        core.enableSystemWideProxy();
        logger.info(`Enabled system-wide proxy via tun2proxy.`);
    }

    logger.info(`Starting SSH tunnel proxy to ${proxy.instanceIp}:${proxy.sshPort}.`);
    models.updateConfig({...config(), CONNECTED: false});
    io.emit('/config', config());

    while (!config().CONNECTED) {
        await integrations.shell.pkill(`${port}:`);
        await lib.sleep(1000);

        integrations.shell.command(proxy.connectionString);
        await lib.sleep(config().SSH_CONNECTION_TIMEOUT_SEC * 1000);

        try {
            const output = Deno.readTextFileSync(proxy.sshLogPath);
            const hasNetwork = output.includes('pledge: network');

            if (hasNetwork) {
                logger.info(`Connected SSH tunnel to ${proxy.instanceIp}:${port}.`);
                models.updateProxy(proxy);
                models.updateConfig({...config(), CONNECTED: true});
                io.emit('/config', config());
            }
        }
        catch(err) {
            logger.warn(err);
            logger.warn(`Restarting SSH tunnel to ${proxy.instanceIp}:${port}.`);
        }
    }
};

const rotate = async () => {
    const instanceProviders = lib.shuffle(config().INSTANCE_PROVIDERS)
        .filter((instanceProvider: InstanceProvider) => !config().INSTANCE_PROVIDERS_DISABLED.includes(instanceProvider));
    if (!instanceProviders.length) {
        return logger.warn('None of the VPS providers are enabled.');
    }
    const instanceProvider: InstanceProvider = lib.shuffle(instanceProviders)[0];
    const activeProxies: Proxy[] = [];
    const initialProxy = models.getInitialProxy();
    if (initialProxy) {
        await connect(initialProxy);
        io.emit('/proxy', initialProxy);
        activeProxies.push(initialProxy);
    }
    const proxyTypes: ProxyType[] = initialProxy
        ? [ProxyType.A]
        : config().PROXY_TYPES;

    let proxyIndex = 0;
    while (proxyIndex < proxyTypes.length) {
        const proxyUuid = uuidv7();
        const proxyType = proxyTypes[proxyIndex];
        const instanceLocationsList = await integrations.compute[instanceProvider].regions.parse();
        const [instanceRegion, instanceCountry]: string[] = lib.shuffle(instanceLocationsList)[0];
        const instanceName = `${config().APP_ID}-${config().ENV}-${proxyType}-${proxyUuid}`;
        const { instanceSize, instanceImage } = integrations.compute[instanceProvider];
        const sshKeyPath = `${config().SSH_KEY_PATH}/${instanceName}`;
        const passphrase = crypto.randomBytes(64).toString('hex');
        const publicKey = await integrations.shell.privateKey.create(sshKeyPath, passphrase);
        const instancePublicKeyId = await integrations.compute[instanceProvider].keys.add(publicKey, instanceName);
        const jwtSecret = crypto.randomBytes(64).toString('hex');
        const sshPort = lib.randomNumberFromRange(config().SSH_PORT_RANGE[0], config().SSH_PORT_RANGE[1]);
        const userData = serverScripts.getUserData(proxyUuid, sshPort, jwtSecret);
        const formattedUserData = integrations.compute[instanceProvider].userData.format(userData);
        const instancePayload: CreateDigitalOceanInstance & CreateHetznerInstance & CreateVultrInstance = {
            datacenter: instanceRegion,
            region: instanceRegion,
            image: instanceImage,
            os_id: -1,
            name: instanceName,
            label: instanceName,
            size: instanceSize,
            plan: instanceSize,
            server_type: instanceSize,
            ssh_keys: [instancePublicKeyId],
            sshkey_id: [instancePublicKeyId],
            user_data: formattedUserData,
            backups: 'disabled',
        };
        const { instanceId, instanceIp } = await integrations.compute[instanceProvider].instances.create(instancePayload);
        logger.info(`Created ${instanceProvider} instance.`);
        logger.info(instancePayload);
        logger.info(`Found network at ${instanceIp}.`);

        let proxy: Proxy = {
            proxyUuid,
            appId: config().APP_ID,
            instanceProvider,
            instanceName,
            instanceId,
            instanceIp,
            instanceRegion,
            instanceCountry,
            instanceSize,
            instanceImage,
            instancePublicKeyId,
            proxyType,
            sshUser: config().SSH_USER,
            passphrase,
            proxyLocalPort: config().PROXY_LOCAL_PORT,
            proxyRemotePort: config().PROXY_REMOTE_PORT,
            sshHostKey: '',
            sshKeyAlgorithm: config().SSH_KEY_ALGORITHM,
            sshKeyLength: config().SSH_KEY_LENGTH,
            sshKeyPath,
            sshPort,
            sshLogPath: core.getSshLogPath(proxyUuid),
            connectionString: '',
            isDeleted: false,
            createdTime: new Date().toISOString(),
            modifiedTime: null,
            deletedTime: null,
        };
        proxy = await integrations.kv.cloudflare.hostKey.get(proxy, jwtSecret);
        models.updateProxy(proxy);
        activeProxies.push(proxy);
        proxyIndex = proxyIndex + 1;
    }

    !initialProxy && await connect(activeProxies[0]);

    await core.cleanup(
        activeProxies.map(proxy => proxy.instanceId)
    );
};

const loop = async () => {
    setTimeout(async () => {
        const isStillWorking = loopStatus == LoopStatus.ACTIVE;
        isStillWorking
            ? await core.exit(`Timeout after passing ${config().PROXY_RECYCLE_INTERVAL_SEC} seconds.`)
            : await loop();
    }, config().PROXY_RECYCLE_INTERVAL_SEC * 1000);

    try {
        updateStatus(LoopStatus.ACTIVE);
        const startTime = performance.now();
        await rotate();
        logger.info('Started proxy rotation.');
        const endTime = performance.now();
        updateStatus(LoopStatus.FINISHED);

        logger.info(
            `Proxy rotation finished in ${
                Number((endTime - startTime) / 1000).toFixed(0)
            } seconds.`,
        );
    } catch (err) {
        await core.exit(`Loop failure: ${err}`);
    }
};

const updateStatus = (status: LoopStatus) => {
    loopStatus = status;
    io.emit('event', status);
};

const heartbeat = async () => {
    const hasHeartbeat = await integrations.kv.cloudflare.heartbeat();
    if (!hasHeartbeat) {
        const isLooped = loopStatus == LoopStatus.FINISHED;
        isLooped && await core.exit('Heartbeat failure');
    }
};

models.updateConfig({...config(), CONNECTED: false});
webserver.start();
websocket.start(io);
config().AUTO_LAUNCH_WEB && open(config().WEB_URL);
config().AUTO_LAUNCH_WEB && models.updateConfig({...config(), AUTO_LAUNCH_WEB: false});
config().PROXY_ENABLED && init();
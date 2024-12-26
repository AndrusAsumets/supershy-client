// deno-lint-ignore-file no-explicit-any

import * as crypto from 'node:crypto';
import { v7 as uuidv7 } from 'npm:uuid';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { open } from 'https://deno.land/x/open@v1.0.0/index.ts';
import { existsSync } from 'https://deno.land/std@0.224.0/fs/mod.ts';
import {
    LoopStatus,
    ConnectionStatus,
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
import { clientScripts } from './src/client-scripts.ts';
import * as serverScripts from './src/server-scripts.ts';

const { config } = models;
const io = new Server({ cors: { origin: '*' }});
const logger = _logger.get(io);

const init = () => {
    integrations.fs.ensureFolder(config().DATA_PATH);
    integrations.fs.ensureFolder(config().BACKUP_PATH);
    integrations.fs.ensureFolder(config().SCRIPT_PATH);
    integrations.fs.ensureFolder(config().SSH_PATH);
    integrations.fs.ensureFolder(config().SSH_KEY_PATH);
    integrations.fs.ensureFolder(config().LOG_PATH);

    !existsSync(config().SSH_KNOWN_HOSTS_PATH) && Deno.writeTextFileSync(config().SSH_KNOWN_HOSTS_PATH, '');

    Object.keys(clientScripts).forEach((fileName: string) => {
        const escapeDollarSignOperator = ['\${', '${'];
        const file = clientScripts[fileName as ClientScriptFileName].replace(escapeDollarSignOperator[0], escapeDollarSignOperator[1]);
        Deno.writeTextFileSync(`${config().SCRIPT_PATH}/${fileName}`, file);
        new Deno.Command('chmod', { args: ['+x', fileName] });
        Deno.chmodSync(`${config().SCRIPT_PATH}/${fileName}`, 0o700);
    });

    loop();
    core.heartbeat();
    setInterval(() => core.heartbeat(), config().HEARTBEAT_INTERVAL_SEC);
};

const connect = async (
    proxy: Proxy,
) => {
    proxy = core.getConnectionString(proxy);
    integrations.fs.hostKey.save(proxy);
    existsSync(proxy.sshLogPath) && Deno.removeSync(proxy.sshLogPath);

    if (config().CONNECTION_KILLSWITCH && models.getInitialProxy()) {
        logger.info(`Enabling connection killswitch.`);
        core.enableConnectionKillSwitch();
        logger.info(`Enabled connection killswitch.`);
    }

    logger.info(`Connecting SSH tunnel proxy to ${proxy.instanceIp}:${proxy.sshPort}.`);
    models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTING});
    io.emit('/config', config());

    while (config().CONNECTION_STATUS != ConnectionStatus.CONNECTED) {
        await integrations.shell.pkill('0.0.0.0/0');
        await lib.sleep(1000);
        integrations.shell.command(proxy.connectionString);
        await lib.sleep(config().SSH_CONNECTION_TIMEOUT_SEC * 1000);

        try {
            const output = Deno.readTextFileSync(proxy.sshLogPath);
            const hasNetwork = output.includes('pledge: network');

            if (hasNetwork) {
                logger.info(`Connected SSH tunnel to ${proxy.instanceIp}:${proxy.sshPort}.`);
                models.updateProxy(proxy);
                models.updateConfig({...config(), CONNECTION_STATUS: ConnectionStatus.CONNECTED});
                io.emit('/config', config());
            }
        }
        catch(err) {
            logger.warn({ message: `Restarting connecting of SSH tunnel to ${proxy.instanceIp}:${proxy.sshPort}.`, err });
        }
    }
};

const loop = async () => {
    setTimeout(async () => {
        const isStillWorking = config().LOOP_STATUS == LoopStatus.ACTIVE;
        isStillWorking
            ? await core.exit(`Timeout after passing ${config().PROXY_RECYCLE_INTERVAL_SEC} seconds.`)
            : await loop();
    }, config().PROXY_RECYCLE_INTERVAL_SEC * 1000);

    try {
        core.setLoopStatus(io, LoopStatus.ACTIVE);
        const startTime = performance.now();
        await rotate();
        logger.info('Started proxy rotation.');
        const endTime = performance.now();
        core.setLoopStatus(io, LoopStatus.FINISHED);

        logger.info(
            `Proxy rotation finished in ${
                Number((endTime - startTime) / 1000).toFixed(0)
            } seconds.`,
        );
    } catch (err) {
        await core.exit(`Loop failure: ${err}`);
    }
};

const rotate = async () => {
    const activeProxies: Proxy[] = [];
    const initialProxy = models.getInitialProxy();
    const proxyTypes: ProxyType[] = !initialProxy
        ? config().PROXY_TYPES
        : [];

    if (initialProxy) {
        await connect(initialProxy);
        io.emit('/proxy', initialProxy);
        activeProxies.push(initialProxy);
        const proxyCurrentReserveCount = core.getCurrentProxyReserve().length;
         // Cant reserve negative proxies.
        const proxiesToReserve = config().PROXY_RESERVE_COUNT - proxyCurrentReserveCount >= 0
            ? config().PROXY_RESERVE_COUNT - proxyCurrentReserveCount
            : 0;
        // Prepare enough proxies for the reserve.
        [...Array(proxiesToReserve).keys()].map(() => proxyTypes.push(ProxyType.A));
        // Mark down active proxies, so we would know which ones to keep from being deleted.
        core.getCurrentProxyReserve().map(
            (proxyUuid: string) => activeProxies.push(models.proxies()[proxyUuid]
        ));
        core.setCurrentProxyReserve(io);
    }

    let proxyIndex = 0;
    while (proxyIndex < proxyTypes.length) {
        const instanceProviders = config().INSTANCE_PROVIDERS
            .filter((instanceProvider: InstanceProvider) => !config().INSTANCE_PROVIDERS_DISABLED.includes(instanceProvider));
        !instanceProviders.length && logger.warn('None of the VPS providers are enabled.');
        const instanceProvider: InstanceProvider = lib.shuffle(instanceProviders)[0];
        const proxyUuid = uuidv7();
        const proxyType = proxyTypes[proxyIndex];
        const instanceLocationsList = await integrations.compute[instanceProvider].regions.parse();
        !instanceLocationsList.length && logger.info('No locations were found. Are any of the countries enabled for the VPS?');
        const [instanceRegion, instanceCountry]: string[] = lib.shuffle(instanceLocationsList)[0];
        const instanceName = `${config().APP_ID}-${config().ENV}-${proxyType}-${proxyUuid}`;
        const { instanceSize, instanceImage } = integrations.compute[instanceProvider];
        const sshKeyPath = `${config().SSH_KEY_PATH}/${instanceName}`;
        const publicKey = await integrations.shell.privateKey.create(sshKeyPath);
        const instancePublicKeyId = await integrations.compute[instanceProvider].keys.add(publicKey, instanceName);
        const jwtSecret = crypto.randomBytes(64).toString('hex');
        const sshPortRange: number[] = config().SSH_PORT_RANGE.split(':').map((item: string) => Number(item));
        const sshPort = lib.randomNumberFromRange(sshPortRange);
        const userData = core.prepareCloudConfig(serverScripts.getUserData(proxyUuid, sshPort, jwtSecret));
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
        core.setCurrentProxyReserve(io);
        proxyIndex = proxyIndex + 1;

    }

    !initialProxy && await connect(activeProxies[0]);
    await core.cleanup(activeProxies.map(proxy => proxy.instanceId));
};

models.updateConfig({
    ...config(),
    LOOP_STATUS: LoopStatus.INACTIVE,
    CONNECTION_STATUS: ConnectionStatus.DISCONNECTED
});
webserver.start();
websocket.start(io);
config().AUTO_LAUNCH_WEB && open(config().WEB_URL);
config().AUTO_LAUNCH_WEB && models.updateConfig({...config(), AUTO_LAUNCH_WEB: false});
config().PROXY_ENABLED && init();
// deno-lint-ignore-file ban-unused-ignore no-explicit-any no-deprecated-deno-api

import * as crypto from 'node:crypto';
import { v7 as uuidv7 } from 'npm:uuid';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import {
    LoopStatus,
    ProxyType,
    Proxy,
    InstanceProvider,
    CreateDigitalOceanInstance,
    CreateHetznerInstance,
    CreateVultrInstance,
} from './src/types.ts';
import * as core from './src/core.ts';
import * as models from './src/models.ts';
import * as webserver from './src/webserver.ts';
import * as websocket from './src/websocket.ts';
import { logger as _logger } from './src/logger.ts';
import * as lib from './src/lib.ts';
import * as integrations from './src/integrations.ts';
const {
    ENV,
    APP_ID,
    PROXY_LOCAL_TEST_PORT,
    PROXY_LOCAL_PORT,
    PROXY_REMOTE_PORT,
    PROXY_URL,
    TEST_PROXY_URL,
    TUNNEL_CONNECT_TIMEOUT_SEC,
    TMP_PATH,
    DATA_PATH,
    SSH_KEY_PATH,
    LOG_PATH,
    GENERATE_SSH_KEY_FILE_NAME,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    SSH_USER,
    PROXY_TYPES,
    SSH_PORT_RANGE,
    PROXY_INTERVAL_SEC,
    SSH_KEY_ALGORITHM,
    SSH_KEY_LENGTH,
    HEARTBEAT_INTERVAL_SEC,
    PROXY_AUTO_CONNECT,
} = models.getConfig();
import {
    GENERATE_SSH_KEY_FILE,
    CONNECT_SSH_TUNNEL_FILE,
} from './src/ssh.ts';

const io = new Server({ cors: { origin: '*' }});
const logger = _logger.get(io);

let loopStatus: LoopStatus = LoopStatus.INACTIVE;

const tunnel = async (
    proxy: Proxy,
    port: number,
    proxyUrl: string | null = null,
) => {
    proxy.connectionString = core
        .getConnectionString(proxy)
        .replace(` ${PROXY_LOCAL_PORT} `, ` ${port} `)
        .replace('\n', '');

    logger.info(`Starting SSH tunnel proxy to ${proxy.instanceIp}:${port}.`);

    let isConnected = false;
    while (!isConnected) {
        try {
            await integrations.shell.pkill(`${port}:`);
            await lib.sleep(1000);

            // @ts-ignore: because
            const process = Deno.run({
                cmd: proxy.connectionString.split(' '),
                stdout: 'piped',
                stderr: 'piped',
                stdin: 'null',
            });
            await lib.sleep(TUNNEL_CONNECT_TIMEOUT_SEC * 1000);
            await process.stderrOutput();
            const output = await Deno.readTextFile(proxy.sshLogPath);
            isConnected = output.includes('pledge: network');

            if (isConnected) {
                await integrations.kv.cloudflare.heartbeat(proxyUrl);
                logger.info(`Connected SSH test tunnel to ${proxy.instanceIp}:${port}.`);
                models.updateProxy(proxy);
            }
        }
        catch(err) {
            logger.warn(JSON.stringify(err));
            logger.warn(`Restarting SSH tunnel to ${proxy.instanceIp}:${port}.`);
        }
    }
};

const connect = async (
    proxy: Proxy,
) => {
    await tunnel(proxy, PROXY_LOCAL_TEST_PORT, TEST_PROXY_URL);
    await integrations.shell.pkill(`${PROXY_LOCAL_TEST_PORT}:`);
    await lib.sleep(1000);
    await tunnel(proxy, PROXY_LOCAL_PORT);
};

const cleanup = async (
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
                    .filter((key: any) => key.name.includes(`${APP_ID}-${ENV}`))
                    .map((key: any) => key.id)
            );
        }

        const deletableInstanceIds = await integrations.compute[instanceProvider].instances.list();
        if (deletableInstanceIds) {
            await integrations.compute[instanceProvider].instances.delete(
                deletableInstanceIds
                    .filter((instance: any) => {
                        if ('name' in instance && instance.name.includes(`${APP_ID}-${ENV}`)) return true;
                        if ('label' in instance && instance.label.includes(`${APP_ID}-${ENV}`)) return true;
                    })
                    .map((instance: any) => instance.id)
                    .filter((id: string) => !instanceIdsToKeep.includes(id))
            );
        }

        index = index + 1;
    }

    models.removeUsedProxies(instanceIdsToKeep);
};

const rotate = async () => {
    const activeProxies: Proxy[] = [];
    const initialProxy = models.getInitialProxy();
    initialProxy && await connect(initialProxy);
    initialProxy && activeProxies.push(initialProxy);
    const proxyTypes: ProxyType[] = initialProxy
        ? [ProxyType.A]
        : PROXY_TYPES;
    const config = models.getConfig();
    const instanceProviders = config
        .INSTANCE_PROVIDERS
        .filter((instanceProvider: InstanceProvider) => !config.INSTANCE_PROVIDERS_DISABLED.includes(instanceProvider));
    if (!instanceProviders.length) {
        return logger.warn('None of the VPS providers are enabled.');
    }
    const instanceProvider: InstanceProvider = lib.randomChoice(instanceProviders);

    let proxyIndex = 0;
    while (proxyIndex < proxyTypes.length) {
        const proxyUuid = uuidv7();
        const proxyType = proxyTypes[proxyIndex];
        const instanceRegions = await integrations.compute[instanceProvider].regions.parse();
        const instanceRegion: string = lib.randomChoice(instanceRegions);
        const instanceName = `${APP_ID}-${ENV}-${proxyType}-${proxyUuid}`;
        const { instanceSize, instanceImage } = integrations.compute[instanceProvider];
        const sshKeyPath = `${SSH_KEY_PATH}/${instanceName}`;
        const passphrase = crypto.randomBytes(64).toString('hex');
        const publicKey = await integrations.shell.privateKey.create(sshKeyPath, passphrase);
        const instancePublicKeyId = await integrations.compute[instanceProvider].keys.add(publicKey, instanceName);
        const jwtSecret = crypto.randomBytes(64).toString('hex');
        const sshPort = lib.randomNumberFromRange(SSH_PORT_RANGE[0], SSH_PORT_RANGE[1]);
        const userData = core.getUserData(proxyUuid, sshPort, jwtSecret);
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
        logger.info(JSON.stringify(instancePayload, null, 4));
        logger.info(`Found network at ${instanceIp}.`);

        let proxy: Proxy = {
            proxyUuid,
            appId: APP_ID,
            instanceProvider,
            instanceName,
            instanceId,
            instanceIp,
            instanceRegion,
            instanceSize,
            instanceImage,
            instancePublicKeyId,
            proxyType,
            sshUser: SSH_USER,
            passphrase,
            proxyIntervalSec: PROXY_INTERVAL_SEC,
            proxyLocalTestPort: PROXY_LOCAL_TEST_PORT,
            proxyLocalPort: PROXY_LOCAL_PORT,
            proxyRemotePort: PROXY_REMOTE_PORT,
            sshHostKey: '',
            sshKeyAlgorithm: SSH_KEY_ALGORITHM,
            sshKeyLength: SSH_KEY_LENGTH,
            sshKeyPath,
            sshPort,
            sshLogPath: core.getSshLogPath(proxyUuid),
            connectionString: '',
            isDeleted: false,
            createdTime: new Date().toISOString(),
            modifiedTime: null,
            deletedTime: null,
        };
        proxy = await integrations.kv.cloudflare.hostKey.update(proxy, jwtSecret);
        models.saveProxy(proxy);
        activeProxies.push(proxy);
        proxyIndex = proxyIndex + 1;
    }

    if (!initialProxy) {
        await connect(activeProxies[0]);
    }

    await cleanup(
        activeProxies.map(proxy => proxy.instanceId)
    );
};

const updateStatus = (status: LoopStatus) => {
    loopStatus = status;
    io.emit('event', status);
};

const loop = async () => {
    setTimeout(async () => {
        const isStillWorking = loopStatus == LoopStatus.ACTIVE;
        isStillWorking
            ? await core.exit(`Timeout after passing ${PROXY_INTERVAL_SEC} seconds.`)
            : await loop();
    }, PROXY_INTERVAL_SEC * 1000);

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

const heartbeat = async () => {
    try {
        await integrations.kv.cloudflare.heartbeat(PROXY_URL);
    }
    catch(err) {
        const isLooped = loopStatus == LoopStatus.FINISHED;

        if (isLooped) {
            await core.exit(`Heartbeat failure: ${err}`);
        }
    }
};

const connectProxy = async () => {
    await integrations.fs.ensureFolder(DATA_PATH);
    await integrations.fs.ensureFolder(SSH_KEY_PATH);
    await integrations.fs.ensureFolder(LOG_PATH);

    Deno.writeTextFileSync(`${TMP_PATH}/${GENERATE_SSH_KEY_FILE_NAME}`, GENERATE_SSH_KEY_FILE);
    Deno.writeTextFileSync(`${TMP_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME}`, CONNECT_SSH_TUNNEL_FILE);

    new Deno.Command('chmod', { args: ['+x', GENERATE_SSH_KEY_FILE_NAME] });
    new Deno.Command('chmod', { args: ['+x', CONNECT_SSH_TUNNEL_FILE_NAME] });

    await Deno.chmod(`${TMP_PATH}/${GENERATE_SSH_KEY_FILE_NAME}`, 0o700);
    await Deno.chmod(`${TMP_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME}`, 0o700);

    loop();
    heartbeat();
    setInterval(() => heartbeat(), HEARTBEAT_INTERVAL_SEC);
};

webserver.start();
websocket.start(io);
PROXY_AUTO_CONNECT && connectProxy();
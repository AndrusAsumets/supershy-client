// deno-lint-ignore-file ban-unused-ignore no-explicit-any no-deprecated-deno-api

import 'jsr:@std/dotenv/load';
import * as crypto from 'node:crypto';
import { v7 as uuidv7 } from 'npm:uuid';
import { serve } from 'https://deno.land/std@0.150.0/http/server.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { serveDir } from 'jsr:@std/http/file-server';
import {
    LoopStatus,
    ConnectionType,
    Connection,
    InstanceProvider,
    CreateDigitalOceanInstance,
    CreateHetznerInstance,
    CreateVultrInstance,
} from './src/types.ts';
import * as core from './src/core.ts';
import { logger as _logger } from './src/logger.ts';
import { db } from './src/db.ts';
import * as lib from './src/lib.ts';
import * as integrations from './src/integrations.ts';
import {
    ENV,
    APP_ID,
    LOOP_INTERVAL_SEC,
    TUNNEL_CONNECT_TIMEOUT_SEC,
    SSH_PORT_RANGE,
    PROXY_LOCAL_TEST_PORT,
    PROXY_LOCAL_PORT,
    PROXY_REMOTE_PORT,
    KEY_ALGORITHM,
    PROXY_URL,
    TEST_PROXY_URL,
    TMP_PATH,
    DATA_PATH,
    KEY_PATH,
    LOG_PATH,
    GENERATE_SSH_KEY_FILE_NAME,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    DB_TABLE,
    USER,
    CONNECTION_TYPES,
    INSTANCE_PROVIDERS,
    HEARTBEAT_INTERVAL_SEC,
    WEB_SOCKET_PORT,
    WEB_SERVER_PORT,
    AUTO_START,
} from './src/constants.ts';
import {
    GENERATE_SSH_KEY_FILE,
    CONNECT_SSH_TUNNEL_FILE,
} from './src/ssh.ts';

const io = new Server({ cors: { origin: '*' }});
const logger = _logger.get(io);

let loopStatus: LoopStatus = LoopStatus.INACTIVE;

const init = async () => {
    const connection = db
        .get()
        .chain
        .get(DB_TABLE)
        .filter((connection: Connection) => !connection.isDeleted)
        .sortBy('createdTime')
        .reverse()
        .value()[0];

    connection && await connect(connection);
    return connection;
};

const tunnel = async (
    connection: Connection,
    port: number,
    proxy: any = null,
) => {
    connection.connectionString = core
        .getConnectionString(connection)
        .replace(` ${PROXY_LOCAL_PORT} `, ` ${port} `)
        .replace('\n', '');

    logger.info(`Starting SSH tunnel connection to ${connection.instanceIp}:${port}.`);

    let isConnected = false;
    while (!isConnected) {
        try {
            await integrations.shell.pkill(`${port}:`);
            await lib.sleep(1000);

            // @ts-ignore: because
            const process = Deno.run({
                cmd: connection.connectionString.split(' '),
                stdout: 'piped',
                stderr: 'piped',
                stdin: 'null',
            });
            await lib.sleep(TUNNEL_CONNECT_TIMEOUT_SEC * 1000);
            await process.stderrOutput();
            const output = await Deno.readTextFile(connection.sshLogOutputPath);
            isConnected = output.includes('pledge: network');

            if (isConnected) {
                await integrations.kv.cloudflare.heartbeat(proxy);
                logger.info(`Connected SSH test tunnel to ${connection.instanceIp}:${port}.`);
                await db.update(connection);
            }
        }
        catch(err) {
            logger.warn(err);
            logger.warn(`Restarting SSH tunnel connection to ${connection.instanceIp}:${port}.`);
        }
    }
};

const connect = async (
    connection: Connection,
) => {
    await tunnel(connection, PROXY_LOCAL_TEST_PORT, { url: TEST_PROXY_URL });
    await integrations.shell.pkill(`${PROXY_LOCAL_TEST_PORT}:`);
    await lib.sleep(1000);
    await tunnel(connection, PROXY_LOCAL_PORT);
};

const cleanup = async (instanceIdsToKeep: number[]) => {
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
                    .filter((id: number) => !instanceIdsToKeep.includes(id))
            );
        }

        index = index + 1;
    }
};

const rotate = async () => {
    const instanceProvider: InstanceProvider = lib.randomChoice(INSTANCE_PROVIDERS);
    const activeConnections: Connection[] = [];
    const initConnection = await init();
    initConnection && activeConnections.push(initConnection);
    const connectionTypes: ConnectionType[] = initConnection
        ? [ConnectionType.A]
        : CONNECTION_TYPES;

    let connectionIndex = 0;
    while (connectionIndex < connectionTypes.length) {
        const connectionUuid = uuidv7();
        const connectionType = connectionTypes[connectionIndex];
        const instanceRegions = await integrations.compute[instanceProvider].regions.list();
        const instanceRegion: string = lib.randomChoice(instanceRegions);
        const instanceName = `${APP_ID}-${ENV}-${connectionType}-${connectionUuid}`;
        const { instanceSize, instanceImage } = integrations.compute[instanceProvider];
        const keyPath = `${KEY_PATH}/${instanceName}`;
        const passphrase = crypto.randomBytes(64).toString('hex');
        const publicKey = await integrations.shell.privateKey.create(keyPath, passphrase);
        const instancePublicKeyId = await integrations.compute[instanceProvider].keys.add(publicKey, instanceName);
        const jwtSecret = crypto.randomBytes(64).toString('hex');
        const sshPort = lib.randomNumberFromRange(SSH_PORT_RANGE[0], SSH_PORT_RANGE[1]);
        const userData = core.getUserData(connectionUuid, sshPort, jwtSecret);
        const formattedUserData = await integrations.compute[instanceProvider].userData.format(userData);
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
        logger.info(`Created ${instanceProvider} instance.`, instancePayload);
        logger.info(`Found network at ${instanceIp}.`);

        let connection: Connection = {
            connectionUuid,
            appId: APP_ID,
            instanceProvider,
            instanceName,
            instanceId,
            instanceIp,
            instanceRegion,
            instanceSize,
            instanceImage,
            instancePublicKeyId,
            connectionType,
            user: USER,
            passphrase,
            loopIntervalSec: LOOP_INTERVAL_SEC,
            keyAlgorithm: KEY_ALGORITHM,
            proxyLocalTestPort: PROXY_LOCAL_TEST_PORT,
            proxyLocalPort: PROXY_LOCAL_PORT,
            proxyRemotePort: PROXY_REMOTE_PORT,
            keyPath,
            sshPort,
            hostKey: '',
            sshLogOutputPath: core.getSshLogOutputPath(connectionUuid),
            connectionString: '',
            isDeleted: false,
            createdTime: new Date().toISOString(),
            modifiedTime: null,
            deletedTime: null,
        };
        connection = await integrations.kv.cloudflare.hostKey.update(connection, jwtSecret);

        db.get().data.connections.push(connection);
        db.get().write();

        activeConnections.push(connection);
        connectionIndex = connectionIndex + 1;
    }

    if (!initConnection) {
        await connect(activeConnections[0]);
    }

    await cleanup(
        activeConnections.map(connection => connection.instanceId)
    );
};

const exit = async (message: string, onPurpose = false) => {
    !onPurpose && logger.error(message);
    await lib.sleep(1000);
    throw new Error();
};

const updateStatus = (status: LoopStatus) => {
    loopStatus = status;
    io.emit('event', status);
};

const loop = async () => {
    setTimeout(async () => {
        const isStillWorking = loopStatus == LoopStatus.ACTIVE;
        isStillWorking
            ? await exit(`Timeout after passing ${LOOP_INTERVAL_SEC} seconds.`)
            : await loop();
    }, LOOP_INTERVAL_SEC * 1000);

    try {
        updateStatus(LoopStatus.ACTIVE);
        const startTime = performance.now();
        await rotate();
        const endTime = performance.now();
        updateStatus(LoopStatus.FINISHED);

        logger.info(
            `Loop finished in ${
                Number((endTime - startTime) / 1000).toFixed(0)
            } seconds.`,
        );
    } catch (err) {
        await exit(`Loop failure: ${err}`);
    }
};

const heartbeat = async () => {
    try {
        await integrations.kv.cloudflare.heartbeat({ url: PROXY_URL });
        io.emit('status', 'connected');
    }
    catch(err) {
        io.emit('status', 'disconnected');
        const isLooped = loopStatus == LoopStatus.FINISHED;

        if (isLooped) {
            await exit(`Heartbeat failure: ${err}`);
        }
    }
};

const start = async () => {
    setInterval(() => heartbeat(), HEARTBEAT_INTERVAL_SEC);

    await integrations.fs.ensureFolder(DATA_PATH);
    await integrations.fs.ensureFolder(KEY_PATH);
    await integrations.fs.ensureFolder(LOG_PATH);

    await Deno.writeTextFileSync(`${TMP_PATH}/${GENERATE_SSH_KEY_FILE_NAME}`, GENERATE_SSH_KEY_FILE);
    await Deno.writeTextFileSync(`${TMP_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME}`, CONNECT_SSH_TUNNEL_FILE);

    await new Deno.Command('chmod', { args: ['+x', GENERATE_SSH_KEY_FILE_NAME] });
    await new Deno.Command('chmod', { args: ['+x', CONNECT_SSH_TUNNEL_FILE_NAME] });

    await Deno.chmod(`${TMP_PATH}/${GENERATE_SSH_KEY_FILE_NAME}`, 0o700);
    await Deno.chmod(`${TMP_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME}`, 0o700);

    loop();
    heartbeat();
};

AUTO_START && start();

Deno.serve(
    { hostname: 'localhost', port: WEB_SERVER_PORT },
    async (req: Request) => {
        const pathname = new URL(req.url).pathname;
        const headers = {
            'content-type': 'application/json; charset=utf-8'
        };

        switch(true) {
            case pathname.startsWith('/app/start'):
                core.updateEnv('AUTO_START', true);
                await lib.sleep(1000);
                setTimeout(() => exit('/app/start', true));
                return new Response(JSON.stringify({ success: true }), { headers });
            case pathname.startsWith('/app/stop'):
                core.updateEnv('AUTO_START', false);
                await lib.sleep(1000);
                setTimeout(() => exit('/app/stop', true));
                return new Response(JSON.stringify({ success: true }), { headers });
            case pathname.startsWith('/'):
                return serveDir(req, {
                    fsRoot: 'public',
                    urlRoot: '',
                });
        }
    }
);

io.on('connection', (socket) => {
    console.log(`socket ${socket.id} connected`);

    io.emit('started', AUTO_START);

    socket.on('disconnect', (reason) => {
        console.log(`socket ${socket.id} disconnected due to ${reason}`);
    });
});

await serve(io.handler(), { port: WEB_SOCKET_PORT });
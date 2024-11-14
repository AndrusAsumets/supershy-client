// deno-lint-ignore-file ban-unused-ignore no-explicit-any no-deprecated-deno-api

import 'jsr:@std/dotenv/load';
import * as crypto from 'node:crypto';
import { v7 as uuidv7 } from 'npm:uuid';
import {
    ConnectionType,
    Connection,
    InstanceProvider,
    CreateDigitalOceanInstance,
    CreateHetznerInstance,
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
    TEST_PROXY_URL,
    __DIRNAME,
    TMP_PATH,
    DATA_PATH,
    KEY_PATH,
    LOG_PATH,
    GENERATE_SSH_KEY_FILE_NAME,
    CONNECT_SSH_TUNNEL_FILE_NAME,
    GENERATE_SSH_KEY_FILE,
    CONNECT_SSH_TUNNEL_FILE,
    DB_TABLE,
    USER,
    CONNECTION_TYPES,
    INSTANCE_PROVIDERS,
} from './src/constants.ts';

const logger = _logger.get();

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
                if (proxy) {
                    logger.info(`Starting API test for ${proxy.url}.`);
                    await integrations.compute[connection.instanceProvider].regions.list(proxy);
                    logger.info(`Finished API test for ${proxy.url}.`);
                }
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
    const proxy = {
        url: TEST_PROXY_URL,
    };
    await tunnel(connection, PROXY_LOCAL_TEST_PORT, proxy);
    await integrations.shell.pkill(`${PROXY_LOCAL_TEST_PORT}:`);
    await lib.sleep(1000);
    await tunnel(connection, PROXY_LOCAL_PORT);
};

const cleanup = async (instanceIdsToKeep: number[]) => {
    const instanceProviders = Object.values(InstanceProvider);

    let index = 0;
    while (index < instanceProviders.length) {
        const instanceProvider = instanceProviders[index];

        const deletableKeyIds = await integrations.compute[instanceProvider].keys.list()
        if (deletableKeyIds) {
            await integrations.compute[instanceProvider].keys.delete(
                deletableKeyIds
                    .filter((key: any) => key.name.includes(`${APP_ID}-${ENV}`))
                    .map((key: any) => key.id)
            );
        }

        const deletableInstanceIds = await integrations.compute[instanceProvider].instances.list()
        if (deletableInstanceIds) {
            await integrations.compute[instanceProvider].instances.delete(
                deletableInstanceIds
                    .filter((instance: any) => instance.name.includes(`${APP_ID}-${ENV}`))
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
        const publicKey = await integrations.shell.private_key.create(keyPath, passphrase);
        const instancePublicKeyId = await integrations.compute[instanceProvider].keys.add(publicKey, instanceName);
        const jwtSecret = crypto.randomBytes(64).toString('hex');
        const sshPort = lib.randomNumberFromRange(SSH_PORT_RANGE[0], SSH_PORT_RANGE[1]);
        const userData = core.getUserData(connectionUuid, sshPort, jwtSecret);
        const instancePayload: CreateDigitalOceanInstance & CreateHetznerInstance = {
            datacenter: instanceRegion,
            region: instanceRegion,
            image: instanceImage,
            name: instanceName,
            size: instanceSize,
            server_type: instanceSize,
            ssh_keys: [instancePublicKeyId],
            user_data: userData
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

const loop = async () => {
    let isFinished = false;

    setTimeout(async () => {
        if (!isFinished) {
            logger.error(`Timeout after passing ${LOOP_INTERVAL_SEC} seconds.`);
            await lib.sleep(1000);
            throw new Error();
        }
        else {
            await loop();
        }
    }, LOOP_INTERVAL_SEC * 1000);

    try {
        const startTime = performance.now();
        await rotate();
        const endTime = performance.now();
        isFinished = true;

        logger.info(
            `Loop finished in ${
                Number((endTime - startTime) / 1000).toFixed(0)
            } seconds.`,
        );
    } catch (err) {
        logger.error(`Proxy loop caught an error.`, err);
    }
};

await integrations.fs.ensureFolder(DATA_PATH);
await integrations.fs.ensureFolder(KEY_PATH);
await integrations.fs.ensureFolder(LOG_PATH);

await Deno.writeTextFileSync(`${TMP_PATH}/${GENERATE_SSH_KEY_FILE_NAME}`, GENERATE_SSH_KEY_FILE);
await Deno.writeTextFileSync(`${TMP_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME}`, CONNECT_SSH_TUNNEL_FILE);

await new Deno.Command('chmod', { args: `+x ${`${TMP_PATH}/${GENERATE_SSH_KEY_FILE_NAME}`}`.split(' ') });
await new Deno.Command('chmod', { args: `+x ${`${TMP_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME}`}`.split(' ') });

await Deno.chmod(`${TMP_PATH}/${GENERATE_SSH_KEY_FILE_NAME}`, 0o700);
await Deno.chmod(`${TMP_PATH}/${CONNECT_SSH_TUNNEL_FILE_NAME}`, 0o700);

await loop();
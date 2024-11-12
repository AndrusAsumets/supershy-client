// deno-lint-ignore-file ban-unused-ignore no-explicit-any no-deprecated-deno-api

import 'jsr:@std/dotenv/load';
import * as crypto from 'node:crypto';
import password from 'npm:secure-random-password';
import { v7 as uuidv7 } from 'npm:uuid';
import {
    ConnectionTypes,
    Connection,
    InstanceProviders,
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
    LOCAL_TEST_PORT,
    LOCAL_PORT,
    REMOTE_PORT,
    KEY_ALGORITHM,
    TEST_PROXY_URL,
    __DIRNAME,
    DATA_PATH,
    KEY_PATH,
    LOG_PATH,
    DB_TABLE,
    USER,
    CONNECTION_TYPES,
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
        .replace(` ${LOCAL_PORT} `, ` ${port} `)
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
    await tunnel(connection, LOCAL_TEST_PORT, proxy);
    await integrations.shell.pkill(`${LOCAL_TEST_PORT}:`);
    await lib.sleep(1000);
    await tunnel(connection, LOCAL_PORT);
};

const cleanup = async (dropletIdsToKeep: number[]) => {
    const deletableKeyIds = (await integrations.compute.digital_ocean.keys.list())
        ['ssh_keys']
        .filter((key: any) => key.name.includes(`${APP_ID}-${ENV}`))
        .map((key: any) => key.id);
    await integrations.compute.digital_ocean.keys.delete(deletableKeyIds);

    const deletableDropletIds = (await integrations.compute.digital_ocean.instances.list())
        .droplets
        .filter((droplet: any) => droplet.name.includes(`${APP_ID}-${ENV}`))
        .map((droplet: any) => droplet.id)
        .filter((id: number) => !dropletIdsToKeep.includes(id));
    await integrations.compute.digital_ocean.instances.delete(deletableDropletIds);
};

const rotate = async () => {
    const instanceProvider = InstanceProviders.HETZNER;
    const activeConnections: Connection[] = [];
    const initConnection = await init();
    initConnection && activeConnections.push(initConnection);
    const connectionTypes: ConnectionTypes[] = initConnection
        ? [ConnectionTypes.A]
        : CONNECTION_TYPES;

    let connectionIndex = 0;
    while (connectionIndex < connectionTypes.length) {
        const connectionUuid = uuidv7();
        const connectionType = connectionTypes[connectionIndex];
        const instanceRegion = (await integrations.compute[instanceProvider].regions.list())
            .sort(() => (Math.random() > 0.5) ? 1 : -1)[0];
        /*
            .filter((region: any) =>
                INSTANCE_REGIONS.length
                    ? INSTANCE_REGIONS
                        .map(instanceRegion => instanceRegion.toLowerCase())
                        .includes(region)
                    : true
            )
        */

        const instanceName = `${APP_ID}-${ENV}-${connectionType}-${connectionUuid}`;
        const { instanceSize, instanceImage } = integrations.compute[instanceProvider];
        const keyPath = `${KEY_PATH}/${instanceName}`;
        const passphrase = password.randomPassword({ length: 32, characters: password.lower + password.upper + password.digits });
        const publicKey = await integrations.shell.private_key.create(keyPath, passphrase);
        const publicKeyId = await integrations.compute[instanceProvider].keys.add(publicKey, instanceName);
        const jwtSecret = crypto.randomBytes(64).toString('hex');
        const sshPort = lib.randomNumberFromRange(SSH_PORT_RANGE[0], SSH_PORT_RANGE[1]);
        const userData = core.getUserData(connectionUuid, sshPort, jwtSecret);
        const instanceCreate = {
            datacenter: instanceRegion,
            region: instanceRegion,
            image: instanceImage,
            name: instanceName,
            size: instanceSize,
            server_type: instanceSize,
            ssh_keys: [publicKeyId],
            user_data: userData
        }
        const instance = await integrations.compute[instanceProvider].instances.create(instanceCreate);
        logger.info(`Created ${instanceProvider} instance.`, instanceCreate, instance);
        const instanceIp = instance.ip
            ? instance.ip
            : await integrations.compute.digital_ocean.ips.get(instance.id);
        logger.info(`Found network at ${instanceIp}.`);

        let connection: Connection = {
            connectionUuid,
            appId: APP_ID,
            instanceProvider,
            instanceId: instance.id,
            instanceName,
            instanceIp,
            instanceRegion,
            instanceSize,
            instanceImage,
            instancePublicKeyId: publicKeyId,
            connectionType,
            user: USER,
            passphrase,
            loopIntervalSec: LOOP_INTERVAL_SEC,
            keyAlgorithm: KEY_ALGORITHM,
            localTestPort: LOCAL_TEST_PORT,
            localPort: LOCAL_PORT,
            remotePort: REMOTE_PORT,
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
await loop();
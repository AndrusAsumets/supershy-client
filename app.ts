// deno-lint-ignore-file ban-unused-ignore no-explicit-any no-deprecated-deno-api

import 'jsr:@std/dotenv/load';
import * as crypto from 'node:crypto';
import { v7 as uuidv7 } from 'npm:uuid';
import {
    ConnectionTypes,
    Connection,
} from './src/types.ts';
import * as core from './src/core.ts';
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
    INSTANCE_SIZE,
    INSTANCE_IMAGE,
    INSTANCE_REGIONS,
    __DIRNAME,
    DATA_PATH,
    KEY_PATH,
    LOG_PATH,
    DB_TABLE,
    USER,
    CONNECTION_TYPES,
} from './src/constants.ts';

const logger = lib.logger.get();
const db = lib.db.get();

const init = async () => {
    const connection = db
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
) => {
    connection.connectionString = core
        .getConnectionString(connection)
        .replace(` ${LOCAL_PORT} `, ` ${port} `)
        .replace('\n', '');
    let isConnected = false;

    logger.info(`Starting SSH tunnel connection to ${connection.instanceIp}:${port}.`);

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
                logger.info(`Connected SSH test tunnel to ${connection.instanceIp}:${port}.`);
                await lib.db.update(connection);
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
    await tunnel(connection, LOCAL_TEST_PORT);
    await integrations.shell.pkill(`${LOCAL_TEST_PORT}:`);
    await lib.sleep(1000);
    await tunnel(connection, LOCAL_PORT);
};

const cleanup = async (dropletIdsToKeep: number[]) => {
    const deletableKeyIds = (await integrations.compute.digital_ocean.listKeys())
        ['ssh_keys']
        .filter((key: any) => key.name.includes(`${APP_ID}-${ENV}`))
        .map((key: any) => key.id);
    await integrations.compute.digital_ocean.deleteKeys(deletableKeyIds);

    const deletableDropletIds = (await integrations.compute.digital_ocean.listDroplets())
        .droplets
        .filter((droplet: any) => droplet.name.includes(`${APP_ID}-${ENV}`))
        .map((droplet: any) => droplet.id)
        .filter((id: number) => !dropletIdsToKeep.includes(id));
    await integrations.compute.digital_ocean.deleteDroplets(deletableDropletIds);
};

const rotate = async () => {
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
        const instanceRegion = (await integrations.compute.digital_ocean.listRegions())
            .filter((region: any) =>
                INSTANCE_REGIONS.length
                    ? INSTANCE_REGIONS
                        .map(instanceRegion => instanceRegion.toLowerCase())
                        .includes(region.slug)
                    : true
            )
            .filter((region: any) => region.sizes.includes(INSTANCE_SIZE))
            .map((region: any) => region.slug)
            .sort(() => (Math.random() > 0.5) ? 1 : -1)[0];
        const instanceName = `${APP_ID}-${ENV}-${connectionType}-${connectionUuid}`;

        const keyPath = `${KEY_PATH}/${instanceName}`;
        const passphrase = crypto.randomBytes(64).toString('hex');
        const publicKeyId = await integrations.shell.private_key.create(keyPath, instanceName, passphrase);
        const jwtSecret = crypto.randomBytes(64).toString('hex');
        const sshPort = lib.randomNumberFromRange(SSH_PORT_RANGE[0], SSH_PORT_RANGE[1]);

        const instanceId = await integrations.compute.digital_ocean.createDroplet({
            region: instanceRegion,
            name: instanceName,
            size: INSTANCE_SIZE,
            publicKeyId,
            userData: core.getUserData(connectionUuid, sshPort, jwtSecret),
        });
        logger.info('Created instance.', {
            instanceName,
            instanceRegion,
            instanceSize: INSTANCE_SIZE,
            instanceId,
            instancePublicKeyId: publicKeyId,
        });

        const instanceIp = await integrations.compute.digital_ocean.getDropletIp(instanceId);

        let connection: Connection = {
            connectionUuid,
            appId: APP_ID,
            instanceId,
            instanceName,
            instanceIp,
            instanceRegion,
            instanceSize: INSTANCE_SIZE,
            instanceImage: INSTANCE_IMAGE,
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
        connection = await integrations.kv.cloudflare.updateHostKey(connection, jwtSecret);

        db.data.connections.push(connection);
        db.write();

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
            logger.error(`Timeout after passing ${LOOP_INTERVAL_SEC * 60} minutes.`);
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

await integrations.shell.ensureFolder(DATA_PATH);
await integrations.shell.ensureFolder(KEY_PATH);
await integrations.shell.ensureFolder(LOG_PATH);
await loop();
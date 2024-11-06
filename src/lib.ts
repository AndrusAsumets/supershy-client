import Logger from 'https://deno.land/x/logger@v1.1.6/logger.ts';
import { Low } from 'npm:lowdb';
import { JSONFile } from 'npm:lowdb/node';
import lodash from 'npm:lodash';

import {
    LOG_PATH,
    DB_FILE_NAME,
    DB_TABLE,
} from './constants.ts';

import {
    DatabaseData,
    Connection,
} from './types.ts';

const _logger = new Logger();
await _logger.initFileLogger(`${LOG_PATH}`);
_logger.disableConsole();

export const logger = {
	get: function () {
        return _logger;
    }
};

const defaultData: DatabaseData = {
    [DB_TABLE]: [],
};

class LowWithLodash<T> extends Low<T> {
    chain: lodash.ExpChain<this['data']> = lodash.chain(this).get('data');
}

const getDatabase = async (): Promise<LowWithLodash<DatabaseData>> => {
    const adapter = new JSONFile<DatabaseData>(DB_FILE_NAME);
    const db = new LowWithLodash(adapter, defaultData);
    await db.read();
    db.data ||= { connections: [] };
    db.chain = lodash.chain(db.data);
    return db;
};

const _db: LowWithLodash<DatabaseData> = await getDatabase();

export const db = {
	get: function () {
        return _db;
    },
    update: async function (
        connection: Connection
    ) {
        await db
            .get()
            .chain
            .get(DB_TABLE)
            .find({ connectionId: connection.connectionId })
            .assign(connection)
            .value();
    
        await db.get().write();
    },
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const randomNumberFromRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

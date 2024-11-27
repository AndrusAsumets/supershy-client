import { Low } from 'npm:lowdb';
import { JSONFile } from 'npm:lowdb/node';
import lodash from 'npm:lodash';

import { config } from './constants.ts';
const {
    DB_FILE_NAME,
} = config;

import {
    DatabaseData,
    DatabaseKey,
} from './types.ts';

const defaultData: DatabaseData = {
    [DatabaseKey.PROXIES]: {},
    [DatabaseKey.CONFIG]: config,
};

class LowWithLodash<T> extends Low<T> {
    chain: lodash.ExpChain<this['data']> = lodash.chain(this).get('data');
}

const getDatabase = async (): Promise<LowWithLodash<DatabaseData>> => {
    const adapter = new JSONFile<DatabaseData>(DB_FILE_NAME);
    const db = new LowWithLodash(adapter, defaultData);
    await db.read();
    db.data = {
        [DatabaseKey.PROXIES]: {...defaultData[DatabaseKey.PROXIES], ...db.data[DatabaseKey.PROXIES]},
        [DatabaseKey.CONFIG]: {...defaultData[DatabaseKey.CONFIG], ...db.data[DatabaseKey.CONFIG]}
    }
    db.chain = lodash.chain(db.data);
    return db;
};

const _db: LowWithLodash<DatabaseData> = await getDatabase();

export const db = {
	get: function () {
        return _db;
    }
};
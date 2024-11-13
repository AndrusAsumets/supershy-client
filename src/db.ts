import { Low } from 'npm:lowdb';
import { JSONFile } from 'npm:lowdb/node';
import lodash from 'npm:lodash';

import {
    DB_FILE_NAME,
    DB_TABLE,
} from './constants.ts';

import {
    DatabaseData,
    Connection,
} from './types.ts';

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
            .find({ connectionUuid: connection.connectionUuid })
            .assign(connection)
            .value();
    
        await db.get().write();
    },
};
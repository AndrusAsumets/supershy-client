import { Low } from 'npm:lowdb';
import { JSONFile } from 'npm:lowdb/node';
import lodash from 'npm:lodash';

import {
    DB_FILE_NAME,
    PROXIES_TABLE,
} from './constants.ts';

import {
    DatabaseData,
    Proxy,
} from './types.ts';

const defaultData: DatabaseData = {
    [PROXIES_TABLE]: [],
};

class LowWithLodash<T> extends Low<T> {
    chain: lodash.ExpChain<this['data']> = lodash.chain(this).get('data');
}

const getDatabase = async (): Promise<LowWithLodash<DatabaseData>> => {
    const adapter = new JSONFile<DatabaseData>(DB_FILE_NAME);
    const db = new LowWithLodash(adapter, defaultData);
    await db.read();
    db.data ||= { [PROXIES_TABLE]: [] };
    db.chain = lodash.chain(db.data);
    return db;
};

const _db: LowWithLodash<DatabaseData> = await getDatabase();

export const db = {
	get: function () {
        return _db;
    },
    update: async function (
        proxy: Proxy
    ) {
        await db
            .get()
            .chain
            .get(PROXIES_TABLE)
            .find({ proxyUuid: proxy.proxyUuid })
            .assign(proxy)
            .value();
    
        await db.get().write();
    },
};
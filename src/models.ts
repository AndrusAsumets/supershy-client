import { db } from './db.ts';
import {
    DB_TABLE,
} from './constants.ts';
import {
    Proxy,
} from './types.ts';

export const getInitialProxy = () => {
    return db
        .get()
        .chain
        .get(DB_TABLE)
        .filter((proxy: Proxy) => !proxy.isDeleted)
        .sortBy('createdTime')
        .reverse()
        .value()[0];
};

export const removeUsedProxies = (
    instanceIdsToKeep: string[]
) => {
    db.get().data[DB_TABLE] = db.get().data[DB_TABLE]
        .filter((proxy: Proxy) => instanceIdsToKeep.includes(proxy.instanceId));
    db.get().write();
};
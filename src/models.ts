import { db } from './db.ts';
import {
    PROXIES_TABLE,
} from './constants.ts';
import {
    Proxy,
} from './types.ts';

export const getInitialProxy = () => {
    return db
        .get()
        .chain
        .get(PROXIES_TABLE)
        .filter((proxy: Proxy) => !proxy.isDeleted)
        .sortBy('createdTime')
        .reverse()
        .value()[0];
};

export const removeUsedProxies = (
    instanceIdsToKeep: string[]
) => {
    db.get().data[PROXIES_TABLE] = db.get().data[PROXIES_TABLE]
        .filter((proxy: Proxy) => instanceIdsToKeep.includes(proxy.instanceId));
    db.get().write();
};
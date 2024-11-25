import { db } from './db.ts';
import {
    Proxy,
    DatabaseKey
} from './types.ts';

export const getInitialProxy = () => {
    return db
        .get()
        .chain
        .get(DatabaseKey.PROXIES)
        .filter((proxy: Proxy) => !proxy.isDeleted)
        .sortBy('createdTime')
        .reverse()
        .value()[0];
};

export const removeUsedProxies = (
    instanceIdsToKeep: string[]
) => {
    db.get().data[DatabaseKey.PROXIES] = db.get().data[DatabaseKey.PROXIES]
        // @ts-ignore: because
        .filter((proxy: Proxy) => instanceIdsToKeep.includes(proxy.instanceId));
    db.get().write();
};
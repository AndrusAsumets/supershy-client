import { db } from './db.ts';
import {
    Proxies,
    Proxy,
    DatabaseKey
} from './types.ts';

export const saveProxy = (
    proxy: Proxy
) => {
    const proxies = db
        .get()
        .chain
        .get(DatabaseKey.PROXIES)
        .value();
    proxies[proxy.proxyUuid] = proxy;
    db.get().write();
};

export const getInitialProxy = () => {
    const proxies = db
        .get()
        .chain
        .get(DatabaseKey.PROXIES)
        .value();
    const proxy = Object
        .keys(proxies)
        .sort()
        .map((proxyUuid: string) => proxies[proxyUuid])
        .filter((proxy: Proxy) => !proxy.isDeleted)
        .reverse()[0];
    return proxy;
};

export const removeUsedProxies = (
    instanceIdsToKeep: string[]
) => {
    const proxies = db
        .get()
        .chain
        .get(DatabaseKey.PROXIES)
        .value();
    const result: Proxies = {};
    Object
        .keys(proxies)
        .map((proxyUuid: string) => proxies[proxyUuid])
        .filter((proxy: Proxy) => instanceIdsToKeep.includes(proxy.instanceId))
        .forEach((proxy: Proxy) => result[proxy.proxyUuid] = proxy);
    db.get().data[DatabaseKey.PROXIES] = result;
    db.get().write();
};
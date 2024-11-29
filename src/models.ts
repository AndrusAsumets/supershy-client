import { db } from './db.ts';
import {
    Proxies,
    Proxy,
    DatabaseKey,
    Config
} from './types.ts';

export const getProxies = () => {
    return db
        .get()
        .chain
        .get(DatabaseKey.PROXIES)
        .value();
};

export const proxies = getProxies;

export const saveProxy = (
    proxy: Proxy
) => {
    const proxies = getProxies();
    proxies[proxy.proxyUuid] = proxy;
    db.get().write();
};

export const updateProxy = (
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
    const proxies = getProxies();
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
    const proxies = getProxies();
    const result: Proxies = {};
    Object
        .keys(proxies)
        .map((proxyUuid: string) => proxies[proxyUuid])
        .filter((proxy: Proxy) => instanceIdsToKeep.includes(proxy.instanceId))
        .forEach((proxy: Proxy) => result[proxy.proxyUuid] = proxy);
    db.get().data[DatabaseKey.PROXIES] = result;
    db.get().write();
};

export const config = (): Config => {
    return db
        .get()
        .chain
        .get(DatabaseKey.CONFIG)
        .value();
};

export const saveConfig = async (
    config: Config
) => {
    db.get().data[DatabaseKey.CONFIG] = config;
    await db.get().write();
};
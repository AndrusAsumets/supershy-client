import { db } from './db.ts';
import {
    Proxies,
    Proxy,
    DatabaseKey,
    Config
} from './types.ts';

export const config = (): Config => {
    return db.data[DatabaseKey.CONFIG] as Config;
};

export const proxies = (): Proxies => {
    return db.data[DatabaseKey.PROXIES] as Proxies;
};

export const updateProxy = (
    proxy: Proxy
) => {
    const proxies = db.data[DatabaseKey.PROXIES] as Proxies;
    proxies[proxy.proxyUuid] = proxy;
    db.write();
};

export const getInitialProxy = () => {
    const proxy = Object
        .keys(proxies())
        .sort()
        .map((proxyUuid: string) => proxies()[proxyUuid])
        .filter((proxy: Proxy) => !proxy.isDeleted)
        .reverse()[0];
    return proxy;
};

export const removeUsedProxies = (
    instanceIdsToKeep: string[]
) => {
    const result: Proxies = {};
    Object
        .keys(proxies)
        .map((proxyUuid: string) => proxies()[proxyUuid])
        .filter((proxy: Proxy) => instanceIdsToKeep.includes(proxy.instanceId))
        .forEach((proxy: Proxy) => result[proxy.proxyUuid] = proxy);
    db.data[DatabaseKey.PROXIES] = result;
    db.write();
};

export const updateConfig = (
    config: Config
) => {
    db.data[DatabaseKey.CONFIG] = config;
    db.write();
};

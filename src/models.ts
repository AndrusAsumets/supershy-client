import { db } from './db.ts';
import * as lib from './lib.ts';
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
    let proxy = Object
        .keys(proxies())
        .sort()
        .map((proxyUuid: string) => proxies()[proxyUuid])
        .filter((proxy: Proxy) => !proxy.connectionString)
        .filter((proxy: Proxy) => !proxy.isDeleted)[0];

    // Reuse, but only when fresh ones are out.
    if (!proxy && Object.values(proxies())[0]) {
        // If one might become unresponsive, then also keep trying the rest.
        const randomProxyIndex = lib.randomNumberFromRange([0, Object.values(proxies()).length - 1]);
        proxy = Object.values(proxies())[randomProxyIndex];
    }
    return proxy;
};

export const getLastConnectedProxy = () => {
    return Object
        .keys(proxies())
        .map((proxyUuid: string) => proxies()[proxyUuid])
        .filter((proxy: Proxy) => !proxy.isDeleted)
        .filter((proxy: Proxy) => proxy.connectedTime)
        .sort((a, b) => b.connectedTime!.localeCompare(a.connectedTime!))[0];
};

export const removeUsedProxies = (
    instanceIdsToKeep: string[]
) => {
    const result: Proxies = {};
    Object
        .keys(proxies())
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

import { db } from './db.ts';
import * as lib from './lib.ts';
import {
    Nodes,
    Node,
    DatabaseKey,
    Config
} from './types.ts';

export const config = (): Config => {
    return db.data[DatabaseKey.CONFIG] as Config;
};

export const nodes = (): Nodes => {
    return db.data[DatabaseKey.NODES] as Nodes;
};

export const updateNode = (
    node: Node
) => {
    const nodes = db.data[DatabaseKey.NODES] as Nodes;
    nodes[node.nodeUuid] = node;
    db.write();
};

export const getInitialNode = () => {
    let node = Object
        .keys(nodes())
        .sort()
        .map((nodeUuid: string) => nodes()[nodeUuid])
        .filter((node: Node) => !node.connectedTime)
        .filter((node: Node) => !node.isDeleted)[0];

    // Reuse, but only when fresh ones are out.
    if (!node && Object.values(nodes())[0]) {
        // If one might become unresponsive, then also keep trying the rest.
        const randomNodeIndex = lib.randomNumberFromRange([0, Object.values(nodes()).length - 1]);
        node = Object.values(nodes())[randomNodeIndex];
    }
    return node;
};

export const getLastConnectedNode = () => {
    return Object
        .keys(nodes())
        .map((nodeUuid: string) => nodes()[nodeUuid])
        .filter((node: Node) => !node.isDeleted)
        .filter((node: Node) => node.connectedTime)
        .sort((a, b) => b.connectedTime!.localeCompare(a.connectedTime!))[0];
};

export const removeUsedNodes = (
    instanceIdsToKeep: string[]
) => {
    const result: Nodes = {};
    Object
        .keys(nodes())
        .map((nodeUuid: string) => nodes()[nodeUuid])
        .filter((node: Node) => instanceIdsToKeep.includes(node.instanceId))
        .forEach((node: Node) => result[node.nodeUuid] = node);
    db.data[DatabaseKey.NODES] = result;
    db.write();
};

export const updateConfig = (
    config: Config
) => {
    db.data[DatabaseKey.CONFIG] = config;
    db.write();
};

export const clearNodes = () => {
    db.data[DatabaseKey.NODES] = {};
    db.write();
};

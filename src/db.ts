import { JSONFileSyncPreset } from 'npm:lowdb/node';
import { config } from './constants.ts';
const {
    DB_FILE_PATH,
} = config;

import {
    DatabaseData,
    DatabaseKey,
} from './types.ts';

const defaultData: DatabaseData = {
    [DatabaseKey.PROXIES]: {},
    [DatabaseKey.CONFIG]: config,
};

export const db = JSONFileSyncPreset<DatabaseData>(DB_FILE_PATH, defaultData);
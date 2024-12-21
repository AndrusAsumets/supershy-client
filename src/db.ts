import { JSONFileSyncPreset } from 'npm:lowdb/node';
import { config } from './constants.ts';

import {
    DatabaseData,
    DatabaseKey,
} from './types.ts';

const defaultData: DatabaseData = {
    [DatabaseKey.PROXIES]: {},
    [DatabaseKey.CONFIG]: config,
};

export const db = JSONFileSyncPreset<DatabaseData>(config.DB_FILE_PATH, defaultData);

db.data = {
    [DatabaseKey.PROXIES]: {...defaultData[DatabaseKey.PROXIES], ...db.data[DatabaseKey.PROXIES]},
    [DatabaseKey.CONFIG]: {...defaultData[DatabaseKey.CONFIG], ...db.data[DatabaseKey.CONFIG]},
};
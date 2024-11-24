import { db } from './db.ts';
import {
    DB_TABLE,
} from './constants.ts';
import {
    Connection,
} from './types.ts';

export const getInitConnection = () => {
    return db
        .get()
        .chain
        .get(DB_TABLE)
        .filter((connection: Connection) => !connection.isDeleted)
        .sortBy('createdTime')
        .reverse()
        .value()[0];
};
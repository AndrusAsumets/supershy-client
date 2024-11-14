import Logger from 'https://deno.land/x/logger@v1.1.6/logger.ts';

import {
    LOG_PATH,
} from './constants.ts';

const _logger = new Logger();
await _logger.initFileLogger(`${LOG_PATH}`);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const randomNumberFromRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

export const logger = {
	get: function () {
        return _logger;
    }
};
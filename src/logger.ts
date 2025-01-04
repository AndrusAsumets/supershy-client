import Logger from 'https://deno.land/x/logger@v1.1.6/logger.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import * as models from './models.ts';

const { config } = models;
const _logger = new Logger();
await _logger.initFileLogger(`${config().LOG_PATH}`);

export const logger = {
	get: function (io: Server | null = null) {
        const { info, warn, error} = _logger;

        _logger.info = async function (...args: unknown[]) {
            info.apply(this, args);
            const timestamp = new Date().toISOString();
            io && io.emit('/log', { Info: [timestamp, ...args] });
        }
        _logger.warn = async function (...args: unknown[]) {
            warn.apply(this, args);
            const timestamp = new Date().toISOString();
            io && io.emit('/log', { Warn: [timestamp, ...args] });
        }
        _logger.error = async function (...args: unknown[]) {
            error.apply(this, args);
            const timestamp = new Date().toISOString();
            io && io.emit('/log', { Error: [timestamp, ...args] });
        }

        return _logger;
    }
};
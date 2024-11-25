import Logger from 'https://deno.land/x/logger@v1.1.6/logger.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { config } from './constants.ts';

const {
    LOG_PATH,
} = config;

const _logger = new Logger();
await _logger.initFileLogger(`${LOG_PATH}`);

export const logger = {
	get: function (io: Server | null = null) {
        const { info, warn, error} = _logger;

        _logger.info = async function (...args: unknown[]) {
            info.apply(this, args);
            const timestamp = new Date().toISOString();
            io && await io.emit('log', { info: [timestamp, ...args] });
        }
        _logger.warn = async function (...args: unknown[]) {
            const timestamp = new Date().toISOString();
            warn.apply(this, args);
            io && await io.emit('log', { warn: [timestamp, ...args] });
        }
        _logger.error = async function (...args: unknown[]) {
            const timestamp = new Date().toISOString();
            error.apply(this, args);
            io && await io.emit('log', { error: [timestamp, ...args] });
        }

        return _logger;
    }
};
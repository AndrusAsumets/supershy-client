import { serve } from 'https://deno.land/std@0.150.0/http/server.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import {
    Config,
} from './types.ts';
import * as core from './core.ts';
import * as models from './models.ts';
import { logger as _logger } from './logger.ts';

const {
    PROXY_AUTO_CONNECT,
    WEB_SOCKET_PORT,
} = models.getConfig();

export const start = (io: Server) => {
    io.on('connection', (socket) => {
        io.emit('/started', PROXY_AUTO_CONNECT);
        io.emit('/config', models.getConfig());

        socket.on('/proxy/connect', async () => {
            await models.saveConfig({...models.getConfig(), 'PROXY_AUTO_CONNECT': true});
            core.exit('/proxy/connect', true);
        });

        socket.on('/proxy/disconnect', async () => {
            await models.saveConfig({...models.getConfig(), 'PROXY_AUTO_CONNECT': false});
            core.exit('/proxy/disconnect', true);
        });

        socket.on('/config/save', async (config: Config) => {
            config = core.setInstanceProviders(config);
            config = await core.setInstanceCountries(config);
            await models.saveConfig(config);
            io.emit('/config', models.getConfig());
        });
    });

    serve(io.handler(), { port: WEB_SOCKET_PORT });
};
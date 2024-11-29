import { serve } from 'https://deno.land/std@0.150.0/http/server.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import {
    Config,
} from './types.ts';
import * as core from './core.ts';
import * as models from './models.ts';

const { config } = models;
const {
    PROXY_AUTO_CONNECT,
    WEB_SOCKET_PORT,
} = config();

export const start = (io: Server) => {
    io.on('connection', async (socket) => {
        io.emit('/started', PROXY_AUTO_CONNECT);
        io.emit('/config', config());

        socket.on('/proxy/connect', async () => {
            await models.saveConfig({...config(), 'PROXY_AUTO_CONNECT': true});
            core.exit('/proxy/connect', true);
        });

        socket.on('/proxy/disconnect', async () => {
            await models.saveConfig({...config(), 'PROXY_AUTO_CONNECT': false});
            core.exit('/proxy/disconnect', true);
        });

        socket.on('/config/save', async (_config: Config) => {
            _config = core.setInstanceProviders(_config);
            await models.saveConfig(_config);
            _config = await core.setInstanceCountries(config());
            await models.saveConfig(_config);
            io.emit('/config', config());
        });
    });

    serve(io.handler(), { port: WEB_SOCKET_PORT });
};
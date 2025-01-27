import { serve } from 'https://deno.land/std@0.150.0/http/server.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { Config } from './types.ts';
import * as core from './core.ts';
import * as models from './models.ts';

const { config } = models;

export const start = (io: Server) => {
    io.on('connection', (socket) => {
        io.emit('/started', config().APP_ENABLED);
        io.emit('/config', config());
        io.emit('/node', models.getLastConnectedNode());
        socket.on('/node/enable', async () => await core.reset(io, '/node/enable', true, false));
        socket.on('/node/disable', async () => await core.reset(io, '/node/disable', false, false));
        socket.on('/config/save', async (newConfig: Config) => await core.saveConfig(io, newConfig));
    });

    serve(io.handler(), { port: config().WEB_SOCKET_PORT });
};
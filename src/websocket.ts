import { serve } from 'https://deno.land/std@0.150.0/http/server.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { config } from './constants.ts';
const {
    PROXY_AUTO_CONNECT,
    WEB_SOCKET_PORT,
} = config;
import * as core from './core.ts';

export const start = async (io: Server) => {
    io.on('connection', (socket) => {
        io.emit('started', PROXY_AUTO_CONNECT);
        io.emit('config', config);

        socket.on('/proxy/connect', () => {
            core.updateEnv('PROXY_AUTO_CONNECT', true);
            setTimeout(() => core.exit('/proxy/connect', true));
        });

        socket.on('/proxy/disconnect', () => {
            core.updateEnv('PROXY_AUTO_CONNECT', false);
            setTimeout(() => core.exit('/proxy/disconnect', true));
        });
    });

    await serve(io.handler(), { port: WEB_SOCKET_PORT });
};
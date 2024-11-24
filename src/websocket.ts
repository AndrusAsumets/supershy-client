import { serve } from 'https://deno.land/std@0.150.0/http/server.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import {
    config,
} from './constants.ts';

export const start = async (io: Server) => {
    io.on('connection', () => {
        io.emit('started', config.PROXY_AUTO_CONNECT);
    });

    await serve(io.handler(), { port: config.WEB_SOCKET_PORT });
};
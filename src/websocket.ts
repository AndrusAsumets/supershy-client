import { serve } from 'https://deno.land/std@0.150.0/http/server.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import {
    Config,
} from './types.ts';
import * as core from './core.ts';
import * as models from './models.ts';

const { config, proxies } = models;
const {
    PROXY_ENABLED,
    WEB_SOCKET_PORT,
} = config();

export const start = (io: Server) => {
    io.on('connection', (socket) => {
        io.emit('/started', PROXY_ENABLED);
        io.emit('/config', config());
        io.emit('/proxy', proxies()[Object.keys(proxies())[0]]);

        socket.on('/proxy/enable', async () => {
            await models.saveConfig({...config(), 'PROXY_ENABLED': true});
            core.exit('/proxy/enable', true);
        });

        socket.on('/proxy/disable', async () => {
            await models.saveConfig({...config(), 'PROXY_ENABLED': false});
            core.exit('/proxy/disable', true);
        });

        socket.on('/config/save', async (_config: Config) => {
            const prevInstanceProvidersDisabled = JSON.stringify(config().INSTANCE_PROVIDERS_DISABLED);
            const currentInstanceProvidersDisabled = JSON.stringify(_config.INSTANCE_PROVIDERS_DISABLED);
            if (prevInstanceProvidersDisabled != currentInstanceProvidersDisabled) {
                _config = core.setInstanceProviders(_config);
                await models.saveConfig(_config);
                _config = await core.setInstanceCountries(config());
            }

            await models.saveConfig(_config);
            io.emit('/config', config());
        });
    });

    serve(io.handler(), { port: WEB_SOCKET_PORT });
};
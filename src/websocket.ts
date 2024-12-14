import { serve } from 'https://deno.land/std@0.150.0/http/server.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';

import {
    Config,
} from './types.ts';
import * as core from './core.ts';
import * as models from './models.ts';
import * as lib from './lib.ts';

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

        socket.on('/proxy/enable', () => {
            models.updateConfig({...config(), 'PROXY_ENABLED': true});
            core.exit('/proxy/enable', true);
        });

        socket.on('/proxy/disable', () => {
            models.updateConfig({...config(), 'PROXY_ENABLED': false});
            core.exit('/proxy/disable', true);
        });

        socket.on('/config/save', async (_config: Config) => {
            const prevInstanceProviders = JSON.stringify(config().INSTANCE_PROVIDERS);
            const prevInstanceProvidersDisabled = JSON.stringify(config().INSTANCE_PROVIDERS_DISABLED);
            const prevProxySystemWide = JSON.stringify(config().PROXY_SYSTEM_WIDE);

            _config = core.setInstanceProviders(_config);
            models.updateConfig(_config);

            const currentInstanceProviders = JSON.stringify(_config.INSTANCE_PROVIDERS);
            const currentInstanceProvidersDisabled = JSON.stringify(_config.INSTANCE_PROVIDERS_DISABLED);
            const currentProxySystemWide = JSON.stringify(_config.PROXY_SYSTEM_WIDE);

            const isInstanceProvidersDiff = lib.isDiff(prevInstanceProviders, currentInstanceProviders);
            const isInstanceProvidersDisabledDiff = lib.isDiff(prevInstanceProvidersDisabled, currentInstanceProvidersDisabled);
            const isCurrentProxySystemWideDiff = lib.isDiff(prevProxySystemWide, currentProxySystemWide);

            if (isInstanceProvidersDiff || isInstanceProvidersDisabledDiff) {
                _config = await core.setInstanceCountries(_config);
                models.updateConfig(_config);
            }

            io.emit('/config', config());
        });
    });

    serve(io.handler(), { port: WEB_SOCKET_PORT });
};
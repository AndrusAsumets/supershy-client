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
            core.disableSystemWideProxy();
            core.exit('/proxy/disable', true);
        });

        socket.on('/config/save', async (newConfig: Config) => {
            const prevConfig: Config = JSON.parse(JSON.stringify(config()));
            models.updateConfig(core.setInstanceProviders(newConfig));

            const isInstanceProvidersDiff = lib.isDiff(prevConfig.INSTANCE_PROVIDERS, config().INSTANCE_PROVIDERS);
            const isInstanceProvidersDisabledDiff = lib.isDiff(prevConfig.INSTANCE_PROVIDERS_DISABLED, config().INSTANCE_PROVIDERS_DISABLED);
            const isCurrentProxySystemWideDiff = lib.isDiff(prevConfig.PROXY_SYSTEM_WIDE, config().PROXY_SYSTEM_WIDE);

            (isInstanceProvidersDiff || isInstanceProvidersDisabledDiff) && models.updateConfig(await core.setInstanceCountries(config()));
            (isCurrentProxySystemWideDiff && config().PROXY_SYSTEM_WIDE == true && models.getInitialProxy()) && core.enableSystemWideProxy(models.getInitialProxy());
            (isCurrentProxySystemWideDiff && config().PROXY_SYSTEM_WIDE == false) && core.disableSystemWideProxy();

            io.emit('/config', config());
        });
    });

    serve(io.handler(), { port: WEB_SOCKET_PORT });
};
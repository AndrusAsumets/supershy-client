import { serve } from 'https://deno.land/std@0.150.0/http/server.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';

import { Config } from './types.ts';
import * as core from './core.ts';
import * as models from './models.ts';
import * as lib from './lib.ts';
import { logger as _logger } from './logger.ts';

const logger = _logger.get();
const { config, proxies } = models;

export const start = (io: Server) => {
    io.on('connection', (socket) => {
        io.emit('/started', config().PROXY_ENABLED);
        io.emit('/config', config());
        io.emit('/proxy', proxies()[Object.keys(proxies())[0]]);

        socket.on('/proxy/enable', () => {
            models.updateConfig({...config(), 'PROXY_ENABLED': true});
            core.exit('/proxy/enable', true);
        });

        socket.on('/proxy/disable', () => {
            models.updateConfig({...config(), 'PROXY_ENABLED': false});
            core.disableConnectionKillSwitch();
            core.disableSystemWideProxy();
            core.exit('/proxy/disable', true);
        });

        socket.on('/config/save', async (newConfig: Config) => {
            const prevConfig: Config = JSON.parse(JSON.stringify(config()));
            models.updateConfig(core.setInstanceProviders(newConfig));

            const isInstanceProvidersDiff = prevConfig.INSTANCE_PROVIDERS.length != config().INSTANCE_PROVIDERS.length;
            const isInstanceProvidersDisabledDiff = prevConfig.INSTANCE_PROVIDERS_DISABLED.length != config().INSTANCE_PROVIDERS_DISABLED.length;
            const isProxySystemWideDiff = lib.isDiff(prevConfig.PROXY_SYSTEM_WIDE, config().PROXY_SYSTEM_WIDE);
            const isConnectionKillswitchDiff = lib.isDiff(prevConfig.CONNECTION_KILLSWITCH, config().CONNECTION_KILLSWITCH);

            (isInstanceProvidersDiff || isInstanceProvidersDisabledDiff) && models.updateConfig(await core.setInstanceCountries(config()));
            (isConnectionKillswitchDiff && config().CONNECTION_KILLSWITCH == true && models.getInitialProxy()) && core.enableConnectionKillSwitch();
            (isConnectionKillswitchDiff && config().CONNECTION_KILLSWITCH == false) && core.disableConnectionKillSwitch();
            (isProxySystemWideDiff && config().PROXY_SYSTEM_WIDE == true && models.getInitialProxy()) && core.exit('prepare for enabling system wide proxy', true);
            (isProxySystemWideDiff && config().PROXY_SYSTEM_WIDE == false) && core.disableSystemWideProxy();

            io.emit('/config', config());
        });
    });

    serve(io.handler(), { port: config().WEB_SOCKET_PORT });
};
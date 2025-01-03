import { serve } from 'https://deno.land/std@0.150.0/http/server.ts';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import { Config, ConnectionStatus } from './types.ts';
import * as core from './core.ts';
import * as models from './models.ts';

const { config } = models;

export const start = (io: Server) => {
    io.on('connection', (socket) => {
        io.emit('/started', config().NODE_ENABLED);
        io.emit('/config', config());
        io.emit('/node', models.getLastConnectedNode());

        socket.on('/node/enable', () => {
            models.updateConfig({...config(), 'NODE_ENABLED': true, CONNECTION_STATUS: ConnectionStatus.DISCONNECTED});
            io.emit('/config', config());
            core.exit('/node/enable', true);
        });

        socket.on('/node/disable', () => {
            models.updateConfig({...config(), 'NODE_ENABLED': false, CONNECTION_STATUS: ConnectionStatus.DISCONNECTED});
            io.emit('/config', config());
            core.exit('/node/disable', true);
        });

        socket.on('/config/save', async (newConfig: Config) => {
            const prevConfig: Config = JSON.parse(JSON.stringify(config()));
            models.updateConfig(core.setInstanceProviders(newConfig));

            const isInstanceProvidersDiff = prevConfig.INSTANCE_PROVIDERS.length != config().INSTANCE_PROVIDERS.length;
            const isInstanceProvidersDisabledDiff = prevConfig.INSTANCE_PROVIDERS_DISABLED.length != config().INSTANCE_PROVIDERS_DISABLED.length;
            const isPluginsEnabledDiff = JSON.stringify(prevConfig.PLUGINS_ENABLED) != JSON.stringify(config().PLUGINS_ENABLED);
            const isConnectionKillswitchDiff = prevConfig.CONNECTION_KILLSWITCH != config().CONNECTION_KILLSWITCH;

            (isInstanceProvidersDiff || isInstanceProvidersDisabledDiff) && models.updateConfig(await core.setInstanceCountries(models.getInitialNode(), config()));
            isPluginsEnabledDiff && core.disableConnectionKillSwitch(models.getInitialNode());
            (isConnectionKillswitchDiff && config().CONNECTION_KILLSWITCH == true && models.getInitialNode()) && core.enableConnectionKillSwitch(models.getInitialNode());
            (isConnectionKillswitchDiff && config().CONNECTION_KILLSWITCH == false) && core.disableConnectionKillSwitch(models.getInitialNode());

            io.emit('/config', config());
        });
    });

    serve(io.handler(), { port: config().WEB_SOCKET_PORT });
};
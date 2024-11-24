import { serveDir } from 'jsr:@std/http/file-server';
import * as core from './core.ts';
import {
    config
} from './constants.ts';

export const start = () => {
    // @ts-ignore: because
    Deno.serve(
        { hostname: 'localhost', port: config.WEB_SERVER_PORT },
        (req: Request) => {
            const pathname = new URL(req.url).pathname;
            const headers = {
                'content-type': 'application/json; charset=utf-8'
            };

            switch(true) {
                case pathname.startsWith('/proxy/connect'):
                    core.updateEnv('PROXY_AUTO_CONNECT', true);
                    setTimeout(() => core.exit('/proxy/connect', true));
                    return new Response(JSON.stringify({ success: true }), { headers });
                case pathname.startsWith('/proxy/disconnect'):
                    core.updateEnv('PROXY_AUTO_CONNECT', false);
                    setTimeout(() => core.exit('/proxy/disconnect', true));
                    return new Response(JSON.stringify({ success: true }), { headers });
                case pathname.startsWith('/'):
                    return serveDir(req, {
                        fsRoot: 'public',
                        urlRoot: '',
                    });
            };
        }
    );
};
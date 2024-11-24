import { serveDir } from 'jsr:@std/http/file-server';
import * as core from './core.ts';
import {
    WEB_SERVER_PORT,
} from './constants.ts';

export const start = () => {
    Deno.serve(
        { hostname: 'localhost', port: WEB_SERVER_PORT },
        (req: Request) => {
            const pathname = new URL(req.url).pathname;
            const headers = {
                'content-type': 'application/json; charset=utf-8'
            };

            switch(true) {
                case pathname.startsWith('/app/start'):
                    core.updateEnv('PROXY_AUTO_CONNECT', true);
                    setTimeout(() => core.exit('/app/start', true));
                    return new Response(JSON.stringify({ success: true }), { headers });
                case pathname.startsWith('/app/stop'):
                    core.updateEnv('PROXY_AUTO_CONNECT', false);
                    setTimeout(() => core.exit('/app/stop', true));
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
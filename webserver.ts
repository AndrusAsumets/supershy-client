import 'jsr:@std/dotenv/load';
import { serveDir } from 'jsr:@std/http/file-server';
import { open } from 'https://deno.land/x/open/index.ts';
import * as integrations from './src/integrations.ts';
import {
    WEB_SERVER_PORT,
} from './src/constants.ts';

const canOpen = Deno.args[0] == 'open';

Deno.serve(
    { hostname: 'localhost', port: WEB_SERVER_PORT },
    async (req: Request) => {
        const pathname = new URL(req.url).pathname;
        const headers = {
            'content-type': 'application/json; charset=utf-8'
        };

        switch(true) {
            case pathname.startsWith('/app/start'):
                integrations.shell.process('deno task app');
                return new Response(JSON.stringify({ success: true }), { headers });
            case pathname.startsWith('/app/stop'):
                await integrations.shell.process('deno task app-stop');
                return new Response(JSON.stringify({ success: true }), { headers });
            case pathname.startsWith('/'):
                return serveDir(req, {
                    fsRoot: 'public',
                    urlRoot: '',
                });
        }
    }
);

canOpen && open(`http://localhost:${WEB_SERVER_PORT}`);
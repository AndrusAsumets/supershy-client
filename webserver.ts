import 'jsr:@std/dotenv/load';
import { serveDir } from 'jsr:@std/http/file-server';
import { open } from 'https://deno.land/x/open/index.ts';

import {
    WEB_SERVER_PORT,
} from './src/constants.ts';

const isOpen = Deno.args[0] == 'open';

Deno.serve(
    { hostname: 'localhost', port: WEB_SERVER_PORT },
    (req: Request) => {
        const pathname = new URL(req.url).pathname;

        if (pathname.startsWith('/')) {
            return serveDir(req, {
                fsRoot: 'public',
                urlRoot: '',
            });
        }
    }
);

isOpen && open(`http://localhost:${WEB_SERVER_PORT}`);
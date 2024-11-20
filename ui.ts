import 'jsr:@std/dotenv/load';
import { serveDir } from 'jsr:@std/http/file-server';
import { WebUI } from 'https://deno.land/x/webui@2.5.0/mod.ts';
import { open } from 'https://deno.land/x/open/index.ts';

import {
    WEB_SERVER_PORT,
} from './src/constants.ts';

const mode = Deno.args[0];

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

if (mode == 'desktop') {
	const myWindow = new WebUI();

	myWindow.bind('exit', () => {
		WebUI.exit();
	});

	myWindow.show('./public/index.html');

	// Wait until all windows get closed
	await WebUI.wait();
}

if (mode == 'web') {
	open(`http://localhost:${WEB_SERVER_PORT}`);
}
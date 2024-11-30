import { serveDir } from 'jsr:@std/http/file-server';
import * as models from './models.ts';

const { config } = models;
const {
    WEB_SERVER_PORT,
} = config();

export const start = () => {
    // @ts-ignore: because
    Deno.serve(
        { hostname: 'localhost', port: WEB_SERVER_PORT },
        (req: Request) => {
            const pathname = new URL(req.url).pathname;

            switch(true) {
                case pathname.startsWith('/'):
                    return serveDir(req, {
                        fsRoot: 'public',
                        urlRoot: '',
                    });
            };
        }
    );
};
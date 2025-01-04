import { serveDir } from 'jsr:@std/http/file-server';
import * as models from './models.ts';

const { config } = models;

export const start = () => {
    // @ts-ignore: because
    Deno.serve(
        { hostname: 'localhost', port: config().WEB_SERVER_PORT },
        (req: Request) => serveDir(req, { fsRoot: config().UI_PATH })
    );
};
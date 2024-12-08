import { serveDir } from 'jsr:@std/http/file-server';
import * as models from './models.ts';

const { config } = models;
const {
    WEB_SERVER_PORT,
    UI_PATH
} = config();

export const start = () => {
    // @ts-ignore: because
    Deno.serve(
        { hostname: 'localhost', port: WEB_SERVER_PORT }, 
        (req: Request) => serveDir(req, { fsRoot: UI_PATH })
    );
};
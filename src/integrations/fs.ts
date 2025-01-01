import { existsSync } from 'https://deno.land/std@0.224.0/fs/mod.ts';

export const fs = {
    ensureFolder: (path: string) => {
        !existsSync(path) && Deno.mkdirSync(path);
    },
};
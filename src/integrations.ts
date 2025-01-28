import { fs } from './integrations/fs.ts';
import { kv } from './integrations/kv.ts';
import { shell } from './integrations/shell.ts';
import { exoscale } from './integrations/compute/exoscale.ts';
import { hetzner } from './integrations/compute/hetzner.ts';

export const integrations = {
    compute: {
        exoscale,
        hetzner,
    },
    fs,
    kv,
    shell,
};

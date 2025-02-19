import { fs } from './integrations/fs.ts';
import { kv } from './integrations/kv.ts';
import { shell } from './integrations/shell.ts';
import { exoscale } from './integrations/compute/exoscale.ts';
import { hetzner } from './integrations/compute/hetzner.ts';
import { upcloud } from './integrations/compute/upcloud.ts';

export const integrations = {
    compute: {
        exoscale,
        hetzner,
        upcloud,
    },
    fs,
    kv,
    shell,
};

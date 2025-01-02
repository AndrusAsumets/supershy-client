import { fs } from './integrations/fs.ts';
import { kv } from './integrations/kv.ts';
import { shell } from './integrations/shell.ts';
import { digital_ocean } from './integrations/compute/digital-ocean.ts';
import { hetzner } from './integrations/compute/hetzner.ts';
import { vultr } from './integrations/compute/vultr.ts';

export const integrations = {
    compute: {
        digital_ocean,
        hetzner,
        vultr,
    },
    fs,
    kv,
    shell,
};

import { fs } from './integrations/fs.ts';
import { kv } from './integrations/kv.ts';
import { shell } from './integrations/shell.ts';
import { digitalOcean } from './integrations/compute/digital-ocean.ts';
import { exoscale } from './integrations/compute/exoscale.ts';
import { hetzner } from './integrations/compute/hetzner.ts';
import { vultr } from './integrations/compute/vultr.ts';

export const integrations = {
    compute: {
        digitalOcean,
        exoscale,
        hetzner,
        vultr,
    },
    fs,
    kv,
    shell,
};

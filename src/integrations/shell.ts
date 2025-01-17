import { bash } from 'https://deno.land/x/bash/mod.ts';
import * as core from '../core.ts';
import * as lib from '../lib.ts';
import * as models from '../models.ts';

const { config } = models;
import {
    Node,
    Action,
    Side,
    Script,
} from '../types.ts';

export const shell = {
    sshKeygen: async (
        node: Node,
    ) => {
        const platformKey = config().PLATFORM;
        const script = core.parseScript(node, node.pluginsEnabled[0], Side.CLIENT, platformKey, Action.MAIN, Script.PREPARE);
        await shell.command(script);
        const publicKeyPath = `${node.sshKeyPath}.pub`;

        while (true) {
            try {
                const file = Deno.readTextFileSync(publicKeyPath);
                if (file) {
                    return file;
                }
            }
            catch(_) {
                _;
            }
            await lib.sleep(1000);
        }
    },
    pkill: async (input: string) => {
        const cmd = 'pkill';
        const args = `-f ${input}`.split(' ');
        const command = new Deno.Command(cmd, { args });
        await command.output();
    },
    command: async (cmd: string, args: string = '') => {
        const nullArg = 'null_argument';
        const output = await bash(`bash -c '${cmd}' ${nullArg} ${args}`);
        return output;
    }
};
import { platform as getPlatform } from 'node:os';
import { bash } from 'https://deno.land/x/bash/mod.ts';
import * as core from '../core.ts';
import * as lib from '../lib.ts';
import * as models from '../models.ts';

const { config } = models;
import {
    Node,
    Action,
    Side,
    Platform,
    Script,
} from '../types.ts';

export const shell = {
    sshKeygen: async (
        node: Node,
    ) => {
        const platformKey = getPlatform() as Platform;
        const script = core.parseScript(node, node.pluginsEnabled[0], Side.CLIENT, platformKey, Action.MAIN, Script.PREPARE);
        const args = `${node.sshKeyPath} ${config().SSH_KEY_ALGORITHM} ${config().SSH_KEY_LENGTH}`;
        await shell.command(script, args);
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
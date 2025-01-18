import { bash } from 'https://deno.land/x/bash/mod.ts';
import * as core from '../core.ts';
import * as models from '../models.ts';

const { config } = models;
import {
    Node,
    Action,
    Side,
    Script,
} from '../types.ts';

export const shell = {
    keygen: async (
        node: Node,
    ) => {
        const platformKey = config().PLATFORM;
        const script = core.parseScript(node, node.pluginsEnabled[0], Side.CLIENT, platformKey, Action.MAIN, Script.PREPARE);
        await shell.command(script);
        const publicKeyPath = `${node.keyPath}.pub`;
        const publicKey = Deno.readTextFileSync(publicKeyPath);
        return publicKey;
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
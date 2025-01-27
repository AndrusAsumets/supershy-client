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
        scriptKey: Script,
    ):Promise<string[]> => {
        const platformKey = config().PLATFORM;
        const script = core.parseScript(node, node.tunnelsEnabled[0], Side.CLIENT, platformKey, Action.MAIN, scriptKey);
        await shell.command(script);
        return [Deno.readTextFileSync(`${node.clientKeyPath}-ssh.pub`), Deno.readTextFileSync(`${node.clientKeyPath}-wireguard.pub`)];
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
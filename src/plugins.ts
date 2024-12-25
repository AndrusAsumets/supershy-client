import {
    Plugins,
    Plugin,
    Platform,
    OperatingSystem,
    Action,
    Function,
} from './types.ts';

export const plugins: Plugins = {
	[Plugin.HTTP_PROXY]: {
		[Platform.CLIENT]: {
			[OperatingSystem.LINUX]: {
				[Action.MAIN]: {
					[Function.ENABLE]: ''
				}
			}
		}
	}
};
import {
	Node,
	Plugins,
	Plugin,
	Side,
	Platform,
	Action,
	Script,
} from './types.ts';
import * as client from './plugins/client.ts';
import * as server from './plugins/server.ts';

export const plugins: Plugins = {
	[Plugin.WIREGUARD_VPN]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.PREPARE]: (node?: Node) => client.PREPARE(node!),
					[Script.ENABLE]: (node?: Node) => client.ENABLE_WIREGUARD(node!)
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => client.ENABLE_LINUX_KILLSWITCH(),
					[Script.DISABLE]: () => client.DISABLE_LINUX_KILLSWITCH(),
				}
			},
		},
		[Side.SERVER]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.ENABLE]: (node?: Node) => `
						${server.ENABLE_WIREGUARD(node!)}
						${server.ENABLE_WIREGUARD_PHONEHOME(node!)}
					`
				}
			}
		},
	},
	[Plugin.SSHUTTLE_VPN]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.PREPARE]: (node?: Node) => client.PREPARE(node!),
					[Script.ENABLE]: (node?: Node) => client.ENABLE_SSHUTTLE(node!)
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => client.ENABLE_LINUX_KILLSWITCH(),
					[Script.DISABLE]: () => client.DISABLE_LINUX_KILLSWITCH(),
				}
			},
			[Platform.DARWIN]: {
				[Action.MAIN]: {
					[Script.PREPARE]: (node?: Node) => client.PREPARE(node!),
					[Script.ENABLE]: (node?: Node) => client.ENABLE_SSHUTTLE(node!)
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => client.ENABLE_DARWIN_KILLSWITCH(),
					[Script.DISABLE]: () => client.DISABLE_DARWIN_KILLSWITCH(),
				}
			},
		},
		[Side.SERVER]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.ENABLE]: (node?: Node) => `
						${server.ENABLE_MAIN(node!)}
						${server.ENABLE_SSH_PHONEHOME(node!)}
					`
				}
			}
		},
	},
	[Plugin.HTTP_PROXY]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.PREPARE]: (node?: Node) => client.PREPARE(node!),
					[Script.ENABLE]: (node?: Node) => client.ENABLE_SSH(node!)
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => client.ENABLE_LINUX_KILLSWITCH(),
					[Script.DISABLE]: () => client.DISABLE_LINUX_KILLSWITCH(),
				}
			},
			[Platform.DARWIN]: {
				[Action.MAIN]: {
					[Script.PREPARE]: (node?: Node) => client.PREPARE(node!),
					[Script.ENABLE]: (node?: Node) => client.ENABLE_SSH(node!)
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => client.ENABLE_DARWIN_KILLSWITCH(),
					[Script.DISABLE]: () => client.DISABLE_DARWIN_KILLSWITCH(),
				}
			},
		},
		[Side.SERVER]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.ENABLE]: (node?: Node) =>
						`
							${server.ENABLE_MAIN(node!)}
							${server.ENABLE_HTTP_PROXY(node!)}
							${server.ENABLE_SSH_PHONEHOME(node!)}
						`
					,
				}
			}
		},
	},
	[Plugin.SOCKS5_PROXY]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.PREPARE]: (node?: Node) => client.PREPARE(node!),
					[Script.ENABLE]: (node?: Node) => client.ENABLE_SSH(node!)
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => client.ENABLE_LINUX_KILLSWITCH(),
					[Script.DISABLE]: () => client.DISABLE_LINUX_KILLSWITCH(),
				}
			},
			[Platform.DARWIN]: {
				[Action.MAIN]: {
					[Script.PREPARE]: (node?: Node) => client.PREPARE(node!),
					[Script.ENABLE]: (node?: Node) => client.ENABLE_SSH(node!)
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => client.ENABLE_DARWIN_KILLSWITCH(),
					[Script.DISABLE]: () => client.DISABLE_DARWIN_KILLSWITCH(),
				}
			},
		},
		[Side.SERVER]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.ENABLE]: (node?: Node) =>
						`
							${server.ENABLE_MAIN(node!)}
							${server.ENABLE_SOCKS5_PROXY(node!)}
							${server.ENABLE_SSH_PHONEHOME(node!)}
						`
					,
				}
			}
		},
	},
};
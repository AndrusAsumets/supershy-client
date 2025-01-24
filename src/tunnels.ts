import {
	Node,
	Tunnels,
	Tunnel,
	Side,
	Platform,
	Action,
	Script,
} from './types.ts';
import * as client from './tunnels/client.ts';
import * as server from './tunnels/server.ts';

export const tunnels: Tunnels = {
	[Tunnel.WIREGUARD]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.PREPARE]: (node?: Node) => client.PREPARE(node!),
					[Script.ENABLE]: (node?: Node) => client.ENABLE_WIREGUARD(node!)
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => client.ENABLE_LINUX_KILLSWITCH(
						`sudo ufw allow out on wg0 from any to any`
					),
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
	[Tunnel.SSHUTTLE]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.PREPARE]: (node?: Node) => client.PREPARE(node!),
					[Script.ENABLE]: (node?: Node) => client.ENABLE_SSHUTTLE(node!)
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => client.ENABLE_LINUX_KILLSWITCH(
						`
							sudo ufw allow out from any to 127.0.0.0/24
							sudo ufw allow out from any to 0.0.0.0/24
						`
					),
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
	[Tunnel.HTTP_PROXY]: {
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
	[Tunnel.SOCKS5_PROXY]: {
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
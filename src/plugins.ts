import {
	Proxy,
    Plugins,
    Plugin,
	Side,
    Platform,
    Action,
    Function,
} from './types.ts';
import * as models from './models.ts';

const { config } = models;

const ENABLE_LINUX_MAIN = (proxy: Proxy) => `
echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config
echo 'Port ${proxy.sshPort}' >> /etc/ssh/sshd_config
sudo systemctl restart ssh

HOST_KEY=$(cat /etc/ssh/ssh_host_ed25519_key.pub | cut -d ' ' -f 2)
ENCODED_HOST_KEY=$(python3 -c 'import sys;import jwt;payload={};payload[\"sshHostKey\"]=sys.argv[1];print(jwt.encode(payload, sys.argv[2], algorithm=\"HS256\"))' $HOST_KEY ${proxy.jwtSecret})
curl --request PUT -H 'Content-Type=*\/*' --data $ENCODED_HOST_KEY --url ${config().CLOUDFLARE_BASE_URL}/accounts/${config().CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${config().CLOUDFLARE_KV_NAMESPACE}/values/${proxy.proxyUuid} --oauth2-bearer ${config().CLOUDFLARE_API_KEY}

iptables -A INPUT -p tcp --dport ${proxy.sshPort} -j ACCEPT
`;

const ENABLE_SSHUTTLE = () => `
ssh_host=$1
ssh_user=$2
ssh_port=$3
key_path=$4
output_path=$5
pid_file_path=$6
proxy_local_port=$7
proxy_remote_port=$8

ssh -v $ssh_user@$ssh_host -f -N -L $proxy_local_port:0.0.0.0:$proxy_remote_port -p $ssh_port -i $key_path -o StrictHostKeyChecking=yes -E $output_path
`;

const ENABLE_SSH = () => `
ssh_host=$1
ssh_user=$2
ssh_port=$3
key_path=$4
output_path=$5
pid_file_path=$6
proxy_local_port=$7
proxy_remote_port=$8

ssh -v $ssh_user@$ssh_host -f -N -L $proxy_local_port:0.0.0.0:$proxy_remote_port -p $ssh_port -i $key_path -o StrictHostKeyChecking=yes -E $output_path
`;

const ENABLE_HTTP_PROXY = (proxy: Proxy) =>
`
sudo apt update
sudo apt dist-upgrade -y
sudo apt install tinyproxy -y
echo 'Port ${proxy.proxyRemotePort}' >> tinyproxy.conf
echo 'Listen 0.0.0.0' >> tinyproxy.conf
echo 'Timeout 600' >> tinyproxy.conf
echo 'Allow 0.0.0.0' >> tinyproxy.conf
tinyproxy -d -c tinyproxy.conf
`;

const ENABLE_SOCKS5_PROXY = (proxy: Proxy) =>
`
sudo apt install microsocks screen -y
screen -dm microsocks -p ${proxy.proxyRemotePort}
`;

const ENABLE_LINUX_KILLSWITCH = () => `

raw_hosts=$1
IFS=',' read -r -a hosts <<< $raw_hosts
target=$(uname -sm)

sudo sysctl -w net.ipv6.conf.all.disable_ipv6=1 || true
sudo sysctl -w net.ipv6.conf.default.disable_ipv6=1 || true

sudo ufw enable
for num in $(sudo ufw status numbered | grep "ALLOW" | awk -F"[][]" '{print $2}' | tr --delete [:blank:] | sort -rn); do
	yes | sudo ufw delete $num
done

sudo ufw default deny incoming
sudo ufw default deny outgoing
sudo ufw allow out from any to 127.0.0.1/24
sudo ufw allow out from any to 0.0.0.0/24

for raw_host in $\{hosts[@]}; do
	IFS=':' read -r -a host <<< $raw_host
	eval "sudo ufw allow out from any to $\{host[0]} port $\{host[1]}"
done

sudo ufw reload
`;

const DISABLE_LINUX_KILLSWITCH = () => `

sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0 || true
sudo sysctl -w net.ipv6.conf.default.disable_ipv6=0 || true
sudo ufw disable || true
sudo ufw --force reset || true
`;

export const plugins: Plugins = {
	[Plugin.SSHUTTLE_VPN]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Function.ENABLE]: () => ENABLE_SSHUTTLE()
				},
				[Action.KILLSWITCH]: {
					[Function.ENABLE]: () => ENABLE_LINUX_KILLSWITCH(),
					[Function.DISABLE]: () => DISABLE_LINUX_KILLSWITCH(),
				}
			}
		},
		[Side.SERVER]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Function.ENABLE]: (proxy?: Proxy) => ENABLE_LINUX_MAIN(proxy!)
				}
			}
		},
	},
	[Plugin.HTTP_PROXY]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Function.ENABLE]: () => ENABLE_SSH()
				}
			}
		},
		[Side.SERVER]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Function.ENABLE]: (proxy?: Proxy) =>
						`
							${ENABLE_HTTP_PROXY(proxy!)}
							${ENABLE_LINUX_MAIN(proxy!)}
						`
					,
				},
				[Action.KILLSWITCH]: {
					[Function.ENABLE]: () => ENABLE_LINUX_KILLSWITCH(),
					[Function.DISABLE]: () => DISABLE_LINUX_KILLSWITCH(),
				}
			}
		},
	},
	[Plugin.SOCKS5_PROXY]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Function.ENABLE]: () => ENABLE_SSH()
				}
			}
		},
		[Side.SERVER]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Function.ENABLE]: (proxy?: Proxy) =>
						`
							${ENABLE_SOCKS5_PROXY(proxy!)}
							${ENABLE_LINUX_MAIN(proxy!)}
						`
					,
				},
				[Action.KILLSWITCH]: {
					[Function.ENABLE]: () => ENABLE_LINUX_KILLSWITCH(),
					[Function.DISABLE]: () => DISABLE_LINUX_KILLSWITCH(),
				}
			}
		},
	},
};
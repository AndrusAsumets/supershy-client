import {
	Node,
    Plugins,
    Plugin,
	Side,
    Platform,
    Action,
    Script,
} from './types.ts';
import * as models from './models.ts';

const { config } = models;

const ENABLE_LINUX_MAIN = (node: Node) => `
echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config
echo 'Port ${node.sshPort}' >> /etc/ssh/sshd_config
sudo systemctl restart ssh

HOST_KEY=$(cat /etc/ssh/ssh_host_ed25519_key.pub | cut -d ' ' -f 2)
ENCODED_HOST_KEY=$(python3 -c 'import sys;import jwt;payload={};payload[\"sshHostKey\"]=sys.argv[1];print(jwt.encode(payload, sys.argv[2], algorithm=\"HS256\"))' $HOST_KEY ${node.jwtSecret})
curl --request PUT -H 'Content-Type=*\/*' --data $ENCODED_HOST_KEY --url ${config().CLOUDFLARE_BASE_URL}/accounts/${config().CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${config().CLOUDFLARE_KV_NAMESPACE}/values/${node.nodeUuid} --oauth2-bearer ${config().CLOUDFLARE_API_KEY}

iptables -A INPUT -p tcp --dport ${node.sshPort} -j ACCEPT
`;

const ENABLE_SSHUTTLE = () => `
ssh_host=$1
ssh_user=$2
ssh_port=$3
key_path=$4
output_path=$5
sshuttle_pid_file_path=$6

sshuttle --daemon --dns --disable-ipv6 -r $ssh_user@$ssh_host:$ssh_port 0.0.0.0/0 -x $ssh_host:$ssh_port --pidfile=$sshuttle_pid_file_path -e "ssh -v -i $key_path -o StrictHostKeyChecking=yes -E $output_path"
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

const ENABLE_HTTP_PROXY = (node: Node) =>
`
sudo apt update
sudo apt dist-upgrade -y
sudo apt install tinyproxy -y
echo 'Port ${node.proxyRemotePort}' >> tinyproxy.conf
echo 'Listen 0.0.0.0' >> tinyproxy.conf
echo 'Timeout 600' >> tinyproxy.conf
echo 'Allow 0.0.0.0' >> tinyproxy.conf
tinyproxy -d -c tinyproxy.conf
`;

const ENABLE_SOCKS5_PROXY = (node: Node) =>
`
sudo apt install microsocks screen -y
screen -dm microsocks -p ${node.proxyRemotePort}
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

const ENABLE_DARWIN_KILLSWITCH = () => `
	daemon_dir=/Library/LaunchDaemons/org.supershy.firewall.plist
	firewall_dir=/usr/local/bin/supershy.firewall.sh
	rules_dir=/etc/pf.anchors/supershy.firewall.rules
	log_dir=~/.supershy-data/logs

	sudo rm -rf $daemon_dir
	sudo rm -rf $firewall_dir
	sudo rm -rf $rules_dir

	# daemon file
	echo '<?xml version="1.0" encoding="UTF-8" ?>' | sudo tee -a $daemon_dir
	echo '<!DOCTYPE plist PUBLIC "-//Apple Computer/DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' | sudo tee -a $daemon_dir
	echo '<plist version="1.0">' | sudo tee -a $daemon_dir
	echo "<dict>" | sudo tee -a $daemon_dir
	echo "<key>Label</key>" | sudo tee -a $daemon_dir
	echo "<string>org.supershy.firewall.plist</string>" | sudo tee -a $daemon_dir
	echo "<key>Program</key>" | sudo tee -a $daemon_dir
	echo "<string>$\{firewall_dir}</string>" | sudo tee -a $daemon_dir
	echo "<key>RunAtLoad</key>" | sudo tee -a $daemon_dir
	echo "<true/>" | sudo tee -a $daemon_dir
	echo "<key>KeepAlive</key>" | sudo tee -a $daemon_dir
	echo "<true/>" | sudo tee -a $daemon_dir
	echo "<key>StandardOutPath</key>" | sudo tee -a $daemon_dir
	echo "<string>$\{log_dir}/supershy.firewall.log</string>" | sudo tee -a $daemon_dir
	echo "<key>StandardErrorPath</key>" | sudo tee -a $daemon_dir
	echo "<string>$\{log_dir}/supershy.firewall.err</string>" | sudo tee -a $daemon_dir
	echo "</dict>" | sudo tee -a $daemon_dir
	echo "</plist>" | sudo tee -a $daemon_dir

	# firewall file
	echo "#!/bin/bash" | sudo tee -a $firewall_dir
	echo "sleep 5" | sudo tee -a $firewall_dir
	echo "/usr/sbin/ipconfig waitall" | sudo tee -a $firewall_dir
	echo "/sbin/pfctl -E -f $\{rules_dir}" | sudo tee -a $firewall_dir

	# rules file
	echo "set skip on lo0" | sudo tee -a $rules_dir
	echo "block in all" | sudo tee -a $rules_dir
	echo "block out all" | sudo tee -a $rules_dir
	echo "pass out to 127.0.0.1/24" | sudo tee -a $rules_dir
	echo "pass out to 0.0.0.0/24" | sudo tee -a $rules_dir

	if [ "$proxy_host1" ]; then
		proxy1="pass out proto tcp to $proxy_host1 port $proxy_port1"
		echo "$\{proxy1}" | sudo tee -a $rules_dir || true
	fi
	if [ "$proxy_host2" ]; then
		proxy2="pass out proto tcp to $proxy_host2 port $proxy_port2"
		echo "$\{proxy2}" | sudo tee -a $rules_dir || true
	fi
	if [ "$proxy_host3" ]; then
		proxy3="pass out proto tcp to $proxy_host3 port $proxy_port3"
		echo "$\{proxy3}" | sudo tee -a $rules_dir || true
	fi

	# permissions
	sudo chmod +x $firewall_dir

	# enable
	sudo launchctl remove $daemon_dir || true
	sudo launchctl unload $daemon_dir || true
	sudo launchctl load $daemon_dir || true
	sudo launchctl start $daemon_dir || true
`;

const DISABLE_DARWIN_KILLSWITCH = () => `
	daemon_dir=/Library/LaunchDaemons/org.supershy.firewall.plist
	firewall_dir=/usr/local/bin/supershy.firewall.sh
	rules_dir=/etc/pf.anchors/supershy.firewall.rules

	sudo rm -rf $daemon_dir
	sudo rm -rf $firewall_dir
	sudo rm -rf $rules_dir

	sudo launchctl stop $daemon_dir &>/dev/null || true
	sudo launchctl remove $daemon_dir || true
	sudo launchctl unload $daemon_dir || true
	sudo pfctl -d || true
`;

export const plugins: Plugins = {
	[Plugin.SSHUTTLE_VPN]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.ENABLE]: () => ENABLE_SSHUTTLE()
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => ENABLE_LINUX_KILLSWITCH(),
					[Script.DISABLE]: () => DISABLE_LINUX_KILLSWITCH(),
				}
			},
			[Platform.DARWIN]: {
				[Action.MAIN]: {
					[Script.ENABLE]: () => ENABLE_SSHUTTLE()
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => ENABLE_DARWIN_KILLSWITCH(),
					[Script.DISABLE]: () => DISABLE_DARWIN_KILLSWITCH(),
				}
			},
		},
		[Side.SERVER]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.ENABLE]: (node?: Node) => ENABLE_LINUX_MAIN(node!)
				}
			}
		},
	},
	[Plugin.HTTP_PROXY]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.ENABLE]: () => ENABLE_SSH()
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => ENABLE_LINUX_KILLSWITCH(),
					[Script.DISABLE]: () => DISABLE_LINUX_KILLSWITCH(),
				}
			},
			[Platform.DARWIN]: {
				[Action.MAIN]: {
					[Script.ENABLE]: () => ENABLE_SSH()
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => ENABLE_DARWIN_KILLSWITCH(),
					[Script.DISABLE]: () => DISABLE_DARWIN_KILLSWITCH(),
				}
			},
		},
		[Side.SERVER]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.ENABLE]: (node?: Node) =>
						`
							${ENABLE_HTTP_PROXY(node!)}
							${ENABLE_LINUX_MAIN(node!)}
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
					[Script.ENABLE]: () => ENABLE_SSH()
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => ENABLE_LINUX_KILLSWITCH(),
					[Script.DISABLE]: () => DISABLE_LINUX_KILLSWITCH(),
				}
			},
			[Platform.DARWIN]: {
				[Action.MAIN]: {
					[Script.ENABLE]: () => ENABLE_SSH()
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => ENABLE_DARWIN_KILLSWITCH(),
					[Script.DISABLE]: () => DISABLE_DARWIN_KILLSWITCH(),
				}
			},
		},
		[Side.SERVER]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.ENABLE]: (node?: Node) =>
						`
							${ENABLE_SOCKS5_PROXY(node!)}
							${ENABLE_LINUX_MAIN(node!)}
						`
					,
				}
			}
		},
	},
};
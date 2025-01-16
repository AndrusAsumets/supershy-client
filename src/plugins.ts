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
import { integrations } from './integrations.ts';

const { config } = models;

const PREPARE_SSH = () => `
key_path=$1
key_algorithm=$2
key_length=$3

ssh-keygen -t $key_algorithm -b $key_length -f $key_path -q -N ""
`;

const ENABLE_LINUX_MAIN = (node: Node) => `
new_user=${node.sshUser}
ssh_config_dir=/etc/ssh/sshd_config
fail2ban_config_dir=/etc/fail2ban/jail.local

# create basic user.
sudo useradd --system --no-create-home -p $(openssl passwd -1 password) $new_user
sudo mkdir -p /home/$new_user/.ssh
sudo cp /root/.ssh/authorized_keys /home/$new_user/.ssh/authorized_keys
sudo chmod 755 /home/$new_user/.ssh/authorized_keys
sudo rm /root/.ssh/authorized_keys
sudo userdel linuxuser # vultr

echo $new_user | sudo tee -a /etc/allowed_users
echo 'auth required pam_listfile.so item=user sense=allow file=/etc/allowed_users onerr=fail' | sudo tee -a /etc/pam.d/sshd

sudo sed -i -e "1i PasswordAuthentication no" $ssh_config_dir
sudo sed -i -e "1i PubkeyAuthentication yes" $ssh_config_dir
sudo sed -i -e "1i AuthenticationMethods publickey" $ssh_config_dir
sudo sed -i -e "1i AuthorizedKeysFile /home/$\{new_user}/.ssh/authorized_keys" $ssh_config_dir
sudo sed -i -e "1i PermitRootLogin no" $ssh_config_dir
echo 'Port ${node.sshPort}' | sudo tee -a $ssh_config_dir

sudo systemctl restart ssh

# port spoof.
sudo apt install git g++ build-essential -y
git clone https://github.com/drk1wi/portspoof.git
cd portspoof/
./configure --sysconfdir=/etc/
make
sudo make install
iptables -t nat -A PREROUTING -i eth0 -p tcp -m tcp --dport 1:${Number(node.sshPort) - 1} -j REDIRECT --to-ports 4444
iptables -t nat -A PREROUTING -i eth0 -p tcp -m tcp --dport ${Number(node.sshPort) + 1}:65535 -j REDIRECT --to-ports 4444
portspoof -c /etc/portspoof.conf -s /etc/portspoof_signatures -D

# fail2ban
sudo apt update
sudo apt install fail2ban -y

echo '[sshd]' | sudo tee -a $fail2ban_config_dir
echo 'enable = true' | sudo tee -a $fail2ban_config_dir
echo 'port = ${node.sshPort}' | sudo tee -a $fail2ban_config_dir
echo 'sshd_backend = systemd' | sudo tee -a $fail2ban_config_dir
echo 'mode = aggressive' | sudo tee -a $fail2ban_config_dir
echo 'bantime = -1' | sudo tee -a $fail2ban_config_dir
echo 'findtime = 1y' | sudo tee -a $fail2ban_config_dir
echo 'maxretry = 1' | sudo tee -a $fail2ban_config_dir

sudo systemctl enable fail2ban
sudo systemctl start fail2ban

iptables -A INPUT -p tcp --dport ${node.sshPort} -j ACCEPT
`;

const ENABLE_LINUX_PHONEHOME = (node: Node) => `
HOST_KEY=$(cat /etc/ssh/ssh_host_ed25519_key.pub | cut -d ' ' -f 2)
ENCODED_HOST_KEY=$(python3 -c 'import sys;import jwt;payload={};payload[\"sshHostKey\"]=sys.argv[1];print(jwt.encode(payload, sys.argv[2], algorithm=\"HS256\"))' $HOST_KEY ${node.jwtSecret})
curl --request PUT -H 'Content-Type=*\/*' --data $ENCODED_HOST_KEY --url ${integrations.kv.cloudflare.apiBaseurl}/accounts/${config().CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${config().CLOUDFLARE_KV_NAMESPACE}/values/${node.nodeUuid} --oauth2-bearer ${config().CLOUDFLARE_API_KEY}
`;

const ENABLE_SSHUTTLE = () => `
ssh_host=$1
ssh_user=$2
ssh_port=$3
key_path=$4
output_path=$5
sshuttle_pid_file_path=$6

sshuttle --daemon --dns --disable-ipv6 -r $ssh_user@$ssh_host:$ssh_port 0.0.0.0/0 -x $ssh_host:$ssh_port --pidfile=$sshuttle_pid_file_path -e "ssh -vv -i $key_path -o StrictHostKeyChecking=yes -E $output_path"
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

sudo ifconfig utun0 down || true

ssh -vv $ssh_user@$ssh_host -f -N -L $proxy_local_port:0.0.0.0:$proxy_remote_port -p $ssh_port -i $key_path -o StrictHostKeyChecking=yes -E $output_path
`;

const ENABLE_HTTP_PROXY = (node: Node) => `
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt -yq upgrade
sudo apt dist-upgrade -y
sudo apt install tinyproxy -y
echo 'Port ${node.proxyRemotePort}' >> tinyproxy.conf
echo 'Listen 0.0.0.0' >> tinyproxy.conf
echo 'Timeout 600' >> tinyproxy.conf
echo 'Allow 0.0.0.0' >> tinyproxy.conf
tinyproxy -d -c tinyproxy.conf
`;

const ENABLE_SOCKS5_PROXY = (node: Node) => `
sudo apt install microsocks screen -y
screen -dm microsocks -p ${node.proxyRemotePort}
`;

const ENABLE_LINUX_KILLSWITCH = () => `
raw_hosts=$1
IFS=',' read -r -a hosts <<< $raw_hosts

sudo sysctl -w net.ipv6.conf.all.disable_ipv6=1 || true
sudo sysctl -w net.ipv6.conf.default.disable_ipv6=1 || true

sudo ufw enable

# Clear out old allowed IPs.
for num in $(sudo ufw status numbered | grep ALLOW | cut -d "]" -f1 | grep -o [[:digit:]]* | tac); do
    yes | sudo ufw delete $num
done

sudo ufw default deny incoming
sudo ufw default deny outgoing
sudo ufw allow out from any to 127.0.0.0/24
sudo ufw allow out from any to 0.0.0.0/24

for host in $\{hosts[@]}; do
	eval "sudo ufw allow out from any to $\{host/:/ port }"
done

sudo ufw reload
`;

const DISABLE_LINUX_KILLSWITCH = () => `
sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0 || true
sudo sysctl -w net.ipv6.conf.default.disable_ipv6=0 || true
sudo ufw disable || true
sudo ufw --force reset || true
`;

const ENABLE_DARWIN_KILLSWITCH = () => ``;
/*
const ENABLE_DARWIN_KILLSWITCH = () => `
raw_hosts=$1
IFS=',' read -r -a hosts <<< $raw_hosts

daemon_dir=/Library/LaunchDaemons/org.supershy.firewall.plist
firewall_dir=/usr/local/supershy.firewall.sh
rules_dir=/etc/pf.anchors/supershy.firewall.rules
log_dir=~/.supershy-data/logs

sudo rm -rf $daemon_dir
sudo rm -rf $firewall_dir
sudo rm -rf $rules_dir

sudo networksetup -setv6off Wi-Fi || true
sudo networksetup -setv6off Ethernet || true

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
echo "sudo /usr/sbin/ipconfig waitall" | sudo tee -a $firewall_dir
echo "sudo /sbin/pfctl -E -f $\{rules_dir}" | sudo tee -a $firewall_dir

# rules file
echo "block drop all" | sudo tee -a $rules_dir
echo "pass on lo0" | sudo tee -a $rules_dir
echo "pass on utun0" | sudo tee -a $rules_dir
echo "pass out to 10.0.0.0/24 | sudo tee -a $rules_dir
echo "pass out to 127.0.0.1/24" | sudo tee -a $rules_dir
echo "pass out to 198.18.0.0/24" | sudo tee -a $rules_dir

for host in $\{hosts[@]}; do
	echo "pass out proto {udp, tcp} to $\{host/:/ port }" | sudo tee -a $rules_dir || true
done

# permissions
sudo chmod +x $firewall_dir
sudo chmod +x $rules_dir

# enable
sudo launchctl remove $daemon_dir || true
sudo launchctl unload $daemon_dir || true
sudo launchctl load $daemon_dir || true
sudo launchctl start $daemon_dir || true
`;
*/

const DISABLE_DARWIN_KILLSWITCH = () => ``;
/*
const DISABLE_DARWIN_KILLSWITCH = () => `
daemon_dir=/Library/LaunchDaemons/org.supershy.firewall.plist
firewall_dir=/usr/local/supershy.firewall.sh
rules_dir=/etc/pf.anchors/supershy.firewall.rules

sudo rm -rf $daemon_dir
sudo rm -rf $firewall_dir
sudo rm -rf $rules_dir

sudo networksetup -setv6automatic Wi-Fi || true
sudo networksetup -setv6automatic Ethernet || true

sudo launchctl stop $daemon_dir &>/dev/null || true
sudo launchctl remove $daemon_dir || true
sudo launchctl unload $daemon_dir || true
sudo pfctl -d || true
sudo ifconfig utun0 down || true
`;
*/

export const plugins: Plugins = {
	[Plugin.SSHUTTLE_VPN]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.PREPARE]: () => PREPARE_SSH(),
					[Script.ENABLE]: () => ENABLE_SSHUTTLE()
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => ENABLE_LINUX_KILLSWITCH(),
					[Script.DISABLE]: () => DISABLE_LINUX_KILLSWITCH(),
				}
			},
			[Platform.DARWIN]: {
				[Action.MAIN]: {
					[Script.PREPARE]: () => PREPARE_SSH(),
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
					[Script.ENABLE]: (node?: Node) => `
						${ENABLE_LINUX_MAIN(node!)}
						${ENABLE_LINUX_PHONEHOME(node!)}
					`
				}
			}
		},
	},
	[Plugin.HTTP_PROXY]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Script.PREPARE]: () => PREPARE_SSH(),
					[Script.ENABLE]: () => ENABLE_SSH()
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => ENABLE_LINUX_KILLSWITCH(),
					[Script.DISABLE]: () => DISABLE_LINUX_KILLSWITCH(),
				}
			},
			[Platform.DARWIN]: {
				[Action.MAIN]: {
					[Script.PREPARE]: () => PREPARE_SSH(),
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
							${ENABLE_LINUX_MAIN(node!)}
							${ENABLE_HTTP_PROXY(node!)}
							${ENABLE_LINUX_PHONEHOME(node!)}
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
					[Script.PREPARE]: () => PREPARE_SSH(),
					[Script.ENABLE]: () => ENABLE_SSH()
				},
				[Action.KILLSWITCH]: {
					[Script.ENABLE]: () => ENABLE_LINUX_KILLSWITCH(),
					[Script.DISABLE]: () => DISABLE_LINUX_KILLSWITCH(),
				}
			},
			[Platform.DARWIN]: {
				[Action.MAIN]: {
					[Script.PREPARE]: () => PREPARE_SSH(),
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
							${ENABLE_LINUX_MAIN(node!)}
							${ENABLE_SOCKS5_PROXY(node!)}
							${ENABLE_LINUX_PHONEHOME(node!)}
						`
					,
				}
			}
		},
	},
};
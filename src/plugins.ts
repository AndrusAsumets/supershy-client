import {
    Plugins,
    Plugin,
	Side,
    Platform,
    Action,
    Function,
} from './types.ts';

export const plugins: Plugins = {
	[Plugin.HTTP_PROXY]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Function.ENABLE]: `#!/bin/bash
						ssh_host=$1
						ssh_user=$2
						ssh_port=$3
						key_path=$4
						output_path=$5
						pid_file_path=$6

						#ssh $ssh_user@$ssh_host -v -p $ssh_port -i $key_path -o StrictHostKeyChecking=yes -E $output_path
					`
				}
			}
		}
	},
	[Plugin.SSHUTTLE_VPN]: {
		[Side.CLIENT]: {
			[Platform.LINUX]: {
				[Action.MAIN]: {
					[Function.ENABLE]: `#!/bin/bash
						ssh_host=$1
						ssh_user=$2
						ssh_port=$3
						key_path=$4
						output_path=$5
						sshuttle_pid_file_path=$6

						sshuttle --daemon --dns --disable-ipv6 -r $ssh_user@$ssh_host:$ssh_port 0.0.0.0/0 -x $ssh_host:$ssh_port --pidfile=$sshuttle_pid_file_path -e "ssh -v -i $key_path -o StrictHostKeyChecking=yes -E $output_path"
					`
				},
				[Action.KILLSWITCH]: {
					[Function.ENABLE]: `#!/bin/bash
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
					`,
					[Function.DISABLE]: `#!/bin/bash
						sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0 || true
						sudo sysctl -w net.ipv6.conf.default.disable_ipv6=0 || true
						sudo ufw disable || true
						sudo ufw --force reset || true
					`
				}
			}
		}
	}
};
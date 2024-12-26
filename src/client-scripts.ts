import { Scripts, ClientScriptFileName } from './types.ts';

const GENERATE_SSH_KEY_FILE = `#!/bin/bash

key_path=$1
key_algorithm=$2
key_length=$3

ssh-keygen -t $key_algorithm -b $key_length -f $key_path -q -N ""
`;

const CONNECT_SSH_TUNNEL_FILE = `#!/bin/bash

ssh_host=$1
ssh_user=$2
ssh_port=$3
key_path=$4
output_path=$5
sshuttle_pid_file_path=$6

sshuttle --daemon --dns --disable-ipv6 -r $ssh_user@$ssh_host:$ssh_port 0.0.0.0/0 -x $ssh_host:$ssh_port --pidfile=$sshuttle_pid_file_path -e "ssh -v -i $key_path -o StrictHostKeyChecking=yes -E $output_path"
`;

const ENABLE_CONNECTION_KILLSWITCH_FILE = `#!/bin/bash

raw_hosts=$1
IFS=',' read -r -a hosts <<< $raw_hosts
target=$(uname -sm)

case $target in
    *"Linux"*)
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
    ;;
    *"Darwin"*)
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

        for raw_host in $\{hosts[@]}; do
            IFS=':' read -r -a host <<< $raw_host
            echo "pass out proto tcp to $\{host[0]} port $\{host[1]}" | sudo tee -a $rules_dir || true
        done

        # permissions
        sudo chmod +x $firewall_dir

        # enable
        sudo launchctl remove $daemon_dir || true
        sudo launchctl unload $daemon_dir || true
        sudo launchctl load $daemon_dir || true
        sudo launchctl start $daemon_dir || true
    ;;
esac
`;

const DISABLE_CONNECTION_KILLSWITCH_FILE = `#!/bin/bash
target=$(uname -sm)

case $target in
    *"Linux"*)
        sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0 || true
        sudo sysctl -w net.ipv6.conf.default.disable_ipv6=0 || true
        sudo ufw disable || true
        sudo ufw --force reset || true
    ;;
    *"Darwin"*)
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
    ;;
esac
`;

export const clientScripts: Scripts = {
    [ClientScriptFileName.GENERATE_SSH_KEY_FILE_NAME]: GENERATE_SSH_KEY_FILE,
};
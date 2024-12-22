import { Scripts, ClientScriptFileName } from './types.ts';

const GENERATE_SSH_KEY_FILE = `#!/usr/bin/expect -f

set key_path [lrange $argv 1 1]
set key_algorithm [lrange $argv 2 2]
set key_length [lrange $argv 3 3]

spawn -ignore HUP ssh-keygen -t $key_algorithm -b $key_length -f $key_path
expect "*passphrase*"
send -- "$passphrase\r"
expect "*?again:*"
send -- "$passphrase\r"
interact
exit 0`;

const CONNECT_SSH_TUNNEL_FILE = `#!/bin/bash

server=$1
user=$2
ssh_port=$3
local_port=$4
remote_port=$5
key_path=$6
output_path=$7

screen -dm sshuttle --auto-hosts --dns -r $user@$server:$ssh_port 0/0 -x $server:$ssh_port -e "ssh -v -i $key_path -o StrictHostKeyChecking=yes -E $output_path"
`;

const ENABLE_CONNECTION_KILLSWITCH_FILE = `#!/bin/bash

proxy_host1=$1
proxy_port1=$2
proxy_host2=$3
proxy_port2=$4
proxy_host3=$5
proxy_port3=$6
target=$(uname -sm)

case $target in
    *"Linux"*)
        sudo ufw --force reset
        sudo ufw default deny incoming
        sudo ufw default deny outgoing
        sudo ufw allow out from any to 127.0.0.1/24
        sudo ufw allow out from any to 0.0.0.0/24
        sudo ufw allow out from any to $proxy_host1 port $proxy_port1 || true
        sudo ufw allow out from any to $proxy_host2 port $proxy_port2 || true
        sudo ufw allow out from any to $proxy_host3 port $proxy_port3 || true
        sudo ufw deny from any to any proto udp || true
        sudo ufw reload
        sudo ufw enable
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
    ;;
esac
`;

const DISABLE_CONNECTION_KILLSWITCH_FILE = `#!/bin/bash
target=$(uname -sm)

case $target in
    *"Linux"*)
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
    [ClientScriptFileName.CONNECT_SSH_TUNNEL_FILE_NAME]: CONNECT_SSH_TUNNEL_FILE,
    [ClientScriptFileName.ENABLE_CONNECTION_KILLSWITCH_FILE_NAME]: ENABLE_CONNECTION_KILLSWITCH_FILE,
    [ClientScriptFileName.DISABLE_CONNECTION_KILLSWITCH_FILE_NAME]: DISABLE_CONNECTION_KILLSWITCH_FILE,
};
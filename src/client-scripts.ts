import { Scripts, ClientScriptFileName } from './types.ts';

const GENERATE_SSH_KEY_FILE = `#!/usr/bin/expect -f

set passphrase [lrange $argv 0 0]
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

const CONNECT_SSH_TUNNEL_FILE = `#!/usr/bin/expect -f

set passphrase [lrange $argv 0 0]
set server [lrange $argv 1 1]
set user [lrange $argv 2 2]
set ssh_port [lrange $argv 3 3]
set local_port [lrange $argv 4 4]
set remote_port [lrange $argv 5 5]
set key_path [lrange $argv 6 6]
set output_path [lrange $argv 7 7]

spawn -ignore HUP ssh -v $user@$server -f -N -L $local_port:0.0.0.0:$remote_port -p $ssh_port -i $key_path -o StrictHostKeyChecking=yes -E $output_path
expect "*passphrase*"
send -- "$passphrase\r"
interact
exit 0`;

const ENABLE_CONNECTION_KILLSWITCH_FILE = `#!/bin/bash

ufw_backup_path=$1
proxy_host_1=$2
proxy_port_1=$3
proxy_host_2=$4
proxy_port_2=$5
target=$(uname -sm)

case $target in
    *"Linux"*)
        sudo tar -cvzf $ufw_backup_path /etc/ufw
        sudo ufw --force reset
        sudo ufw default deny incoming
        sudo ufw default deny outgoing
        sudo ufw allow out from any to 10.0.0.0/24
        sudo ufw allow out from any to 198.18.0.0/24
        sudo ufw allow out from any to $proxy_host_1 port $proxy_port_1 || true
        sudo ufw allow out from any to $proxy_host_2 port $proxy_port_2 || true
        sudo ufw reload
        sudo ufw enable
    ;;
    *"Darwin"*)
        anchor_dir=/etc/pf.anchors/supershy.org

        sudo rm -rf $anchor_dir

        echo "set skip on lo0" | sudo tee -a $anchor_dir
        echo "block in all" | sudo tee -a $anchor_dir
        echo "block out all" | sudo tee -a $anchor_dir
        echo "pass out to 10.0.0.0/24" | sudo tee -a $anchor_dir
        echo "pass out to 198.18.0.0/24" | sudo tee -a $anchor_dir
        echo "pass out proto tcp to $\{proxy_host_1} port $\{proxy_port_1}" | sudo tee -a $anchor_dir || true
        echo "pass out proto tcp to $\{proxy_host_2} port $\{proxy_port_2}" | sudo tee -a $anchor_dir || true

        sudo pfctl -E -f $anchor_dir
    ;;
esac
`;

const DISABLE_CONNECTION_KILLSWITCH_FILE = `#!/bin/bash
ufw_backup_path=$1
target=$(uname -sm)

case $target in
    *"Linux"*)
        sudo ufw disable
        sudo ufw --force reset
        sudo tar -xvzf $ufw_backup_path -C /
        sudo rm $ufw_backup_path
    ;;
    *"Darwin"*)
        anchor_dir=/etc/pf.anchors/supershy.org

        sudo rm -rf $anchor_dir
        sudo pfctl -d
    ;;
esac
`;

const ENABLE_TUN_FILE = `#!/bin/bash

proxy_port=$1
backup_resolv_conf_path=$2
system_resolv_conf_path="$(realpath /etc/resolv.conf)"

if [ -f $system_resolv_conf_path ]; then
    sudo cp $system_resolv_conf_path $backup_resolv_conf_path || true
fi

if [ "$3" ]; then
    bypass1="--bypass $3"
fi

if [ "$4" ]; then
    bypass2="--bypass $4"
fi

sudo pkill -f tun2proxy-bin || true
sleep 1
sudo screen -dm sudo $(which tun2proxy-bin) --setup --proxy http://0.0.0.0:$proxy_port --dns virtual $bypass1 $bypass2 || true
sudo chattr +i $system_resolv_conf_path &>/dev/null || true
`;

const DISABLE_TUN_FILE = `#!/bin/bash

backup_resolv_conf_path=$1
system_resolv_conf_path="$(realpath /etc/resolv.conf)"

sudo chattr -i $system_resolv_conf_path &>/dev/null || true
sudo mv $backup_resolv_conf_path $system_resolv_conf_path || true

if [ -f $backup_resolv_conf_path ]; then
    sudo mv $backup_resolv_conf_path $system_resolv_conf_path || true
fi

sudo ip link del tun0 &>/dev/null || true
sudo umount -f /etc/resolv.conf || true
sudo pkill -f tun2proxy-bin || true
sudo rm $backup_resolv_conf_path || true
`;

export const clientScripts: Scripts = {
    [ClientScriptFileName.GENERATE_SSH_KEY_FILE_NAME]: GENERATE_SSH_KEY_FILE,
    [ClientScriptFileName.CONNECT_SSH_TUNNEL_FILE_NAME]: CONNECT_SSH_TUNNEL_FILE,
    [ClientScriptFileName.ENABLE_CONNECTION_KILLSWITCH_FILE_NAME]: ENABLE_CONNECTION_KILLSWITCH_FILE,
    [ClientScriptFileName.DISABLE_CONNECTION_KILLSWITCH_FILE_NAME]: DISABLE_CONNECTION_KILLSWITCH_FILE,
    [ClientScriptFileName.ENABLE_TUN_FILE_NAME]: ENABLE_TUN_FILE,
    [ClientScriptFileName.DISABLE_TUN_FILE_NAME]: DISABLE_TUN_FILE,
}
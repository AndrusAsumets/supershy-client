export const GENERATE_SSH_KEY_FILE = `#!/usr/bin/expect -f

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

export const CONNECT_SSH_TUNNEL_FILE = `#!/usr/bin/expect -f

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

export const ENABLE_TUN_FILE = `#!/bin/bash
proxy_port=$1
ssh_host=$2
ssh_port=$3

sudo pkill tun2proxy-bin
sudo screen -dm sudo $(which tun2proxy-bin) --setup --proxy http://0.0.0.0:$proxy_port --dns virtual --bypass $ssh_host
sudo sysctl net.ipv6.conf.all.disable_ipv6=1
sudo chattr +i "$(realpath /etc/resolv.conf)"
`;

export const DISABLE_TUN_FILE = `#!/bin/bash

sudo ip link del tun0 || true
sudo umount -f /etc/resolv.conf || true
sudo pkill tun2proxy-bin
sudo sysctl net.ipv6.conf.all.disable_ipv6=0`;
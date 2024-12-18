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
ssh_host=$1
ssh_port=$2

sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default deny outgoing
sudo ufw allow out from any to 10.0.0.0/24
sudo ufw allow out from any to 198.18.0.0/24
sudo ufw allow out from any to $ssh_host port $ssh_port
sudo ufw reload
sudo ufw enable
`;

const DISABLE_CONNECTION_KILLSWITCH_FILE = `#!/bin/bash

sudo ufw --force reset
sudo ufw disable
`;

const ENABLE_TUN_FILE = `#!/bin/bash

proxy_port=$1
ssh_host=$2

sudo pkill tun2proxy-bin
sleep 1
sudo screen -dm sudo $(which tun2proxy-bin) --setup --proxy http://0.0.0.0:$proxy_port --bypass $ssh_host --dns virtual
sudo chattr +i "$(realpath /etc/resolv.conf)"
`;

const DISABLE_TUN_FILE = `#!/bin/bash

sudo ip link del tun0 || true
sudo umount -f /etc/resolv.conf || true
sudo pkill tun2proxy-bin
`;

export const clientScripts: Scripts = {
    [ClientScriptFileName.GENERATE_SSH_KEY_FILE_NAME]: GENERATE_SSH_KEY_FILE,
    [ClientScriptFileName.CONNECT_SSH_TUNNEL_FILE_NAME]: CONNECT_SSH_TUNNEL_FILE,
    [ClientScriptFileName.ENABLE_CONNECTION_KILLSWITCH_FILE_NAME]: ENABLE_CONNECTION_KILLSWITCH_FILE,
    [ClientScriptFileName.DISABLE_CONNECTION_KILLSWITCH_FILE_NAME]: DISABLE_CONNECTION_KILLSWITCH_FILE,
    [ClientScriptFileName.ENABLE_TUN_FILE_NAME]: ENABLE_TUN_FILE,
    [ClientScriptFileName.DISABLE_TUN_FILE_NAME]: DISABLE_TUN_FILE,
}
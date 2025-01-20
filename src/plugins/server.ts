import { Node } from '../types.ts';
import * as models from '../models.ts';
import { integrations } from '../integrations.ts';

const { config } = models;

export const ENABLE_MAIN = (node: Node) => `
new_user=${node.sshUser}
ssh_config_dir=/etc/ssh/sshd_config
fail2ban_config_dir=/etc/fail2ban/jail.local

# Create basic user.
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
echo 'Port ${node.serverPort}' | sudo tee -a $ssh_config_dir

sudo systemctl restart ssh

# Port spoof.
sudo apt install git g++ build-essential -y
git clone https://github.com/drk1wi/portspoof.git
cd portspoof/
./configure --sysconfdir=/etc/
make
sudo make install
iptables -t nat -A PREROUTING -i eth0 -p tcp -m tcp --dport 1:${Number(node.serverPort) - 1} -j REDIRECT --to-ports 4444
iptables -t nat -A PREROUTING -i eth0 -p tcp -m tcp --dport ${Number(node.serverPort) + 1}:65535 -j REDIRECT --to-ports 4444
portspoof -c /etc/portspoof.conf -s /etc/portspoof_signatures -D

# fail2ban
sudo apt update
sudo apt install fail2ban -y

echo '[sshd]' | sudo tee -a $fail2ban_config_dir
echo 'enable = true' | sudo tee -a $fail2ban_config_dir
echo 'port = ${node.serverPort}' | sudo tee -a $fail2ban_config_dir
echo 'sshd_backend = systemd' | sudo tee -a $fail2ban_config_dir
echo 'mode = aggressive' | sudo tee -a $fail2ban_config_dir
echo 'bantime = -1' | sudo tee -a $fail2ban_config_dir
echo 'findtime = 1y' | sudo tee -a $fail2ban_config_dir
echo 'maxretry = 1' | sudo tee -a $fail2ban_config_dir

sudo systemctl enable fail2ban
sudo systemctl start fail2ban

iptables -A INPUT -p tcp --dport ${node.serverPort} -j ACCEPT
`;

export const ENABLE_HTTP_PROXY = (node: Node) => `
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

export const ENABLE_SOCKS5_PROXY = (node: Node) => `
sudo apt install microsocks screen -y
screen -dm microsocks -p ${node.proxyRemotePort}
`;

export const ENABLE_WIREGUARD = (node: Node) => `
wireguard_dir=/etc/wireguard
wireguard_config_dir=$wireguard_dir/wg0.conf

sudo apt install wireguard -y
sudo modprobe wireguard

# Keys.
umask 0744
sudo wg genkey > $wireguard_dir/server-private.key
sudo wg pubkey < $wireguard_dir/server-private.key > $wireguard_dir/server-public.key

# Config.
echo [Interface] | sudo tee -a $wireguard_config_dir
echo Address = 10.10.10.1/24 | sudo tee -a $wireguard_config_dir
echo ListenPort = ${node.serverPort} | sudo tee -a $wireguard_config_dir
echo PrivateKey = $(cat $wireguard_dir/server-private.key) | sudo tee -a $wireguard_config_dir
echo DNS = 1.1.1.1 | sudo tee -a $wireguard_config_dir

echo [Peer] | sudo tee -a $wireguard_config_dir
echo AllowedIPs = 10.10.10.2/32 | sudo tee -a $wireguard_config_dir
echo PublicKey = ${Deno.readTextFileSync(node.clientKeyPath + '-wireguard.pub').replace('\n', '')} | sudo tee -a $wireguard_config_dir
echo PersistentKeepalive = 25 | sudo tee -a $wireguard_config_dir

# Enable IP forwarding.
echo net.ipv4.ip_forward=1 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Allow WireGuard through the firewall.
sudo iptables -A INPUT -p udp --dport ${node.serverPort} -j ACCEPT
sudo iptables -A INPUT -i wg0 -j ACCEPT
sudo iptables -A FORWARD -i wg0 -j ACCEPT
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# Start wireguard server
sudo wg-quick up $wireguard_config_dir
`;

export const PHONEHOME = (node: Node) => `
encoded_key=$(python3 -c 'import sys;import jwt;payload={};payload[\"key\"]=sys.argv[1];print(jwt.encode(payload, sys.argv[2], algorithm=\"HS256\"))' $key ${node.jwtSecret})
curl --request PUT -H 'Content-Type=*\/*' --data $encoded_key --url ${integrations.kv.cloudflare.apiBaseurl}/accounts/${config().CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${config().CLOUDFLARE_KV_NAMESPACE}/values/${node.nodeUuid}-${node.connectionType} --oauth2-bearer ${config().CLOUDFLARE_API_KEY}
`;

export const ENABLE_SSH_PHONEHOME = (node: Node) => `
key=$(cat /etc/ssh/ssh_host_ed25519_key.pub | cut -d ' ' -f 2)
${PHONEHOME(node)}
`;

export const ENABLE_WIREGUARD_PHONEHOME = (node: Node) => `
key=$(cat $wireguard_dir/server-public.key)
${PHONEHOME(node)}
`;
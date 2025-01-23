import  { Node } from '../types.ts';
import * as models from '../models.ts';

const { config } = models;

export const PREPARE = (node: Node) => `
ssh-keygen -t ${node.sshKeyAlgorithm} -b ${node.sshKeyLength} -f ${node.clientKeyPath}-ssh -q -N ""

wg genkey > ${node.clientKeyPath}-wireguard
wg pubkey < ${node.clientKeyPath}-wireguard > ${node.clientKeyPath}-wireguard.pub
wg genpsk > ${node.clientKeyPath}-wireguard.preshared
`;

export const ENABLE_WIREGUARD = (node: Node) => `
wireguard_config_dir=${config().WIREGUARD_CONFIG_PATH}

sudo wg-quick down $wireguard_config_dir || true
sudo rm -rf $wireguard_config_dir

echo [Interface] | sudo tee -a $wireguard_config_dir
echo PrivateKey = ${Deno.readTextFileSync(node.clientKeyPath + '-wireguard').replace('\n', '')} | sudo tee -a $wireguard_config_dir
echo Address = 10.0.0.2/24 | sudo tee -a $wireguard_config_dir
echo DNS = 10.0.0.1 | sudo tee -a $wireguard_config_dir

echo [Peer] | sudo tee -a $wireguard_config_dir
echo PublicKey = ${node.serverPublicKey} | sudo tee -a $wireguard_config_dir
echo PresharedKey = ${Deno.readTextFileSync(node.clientKeyPath + '-wireguard.preshared').replace('\n', '')} | sudo tee -a $wireguard_config_dir
echo Endpoint = ${node.instanceIp}:${node.serverPort} | sudo tee -a $wireguard_config_dir
echo AllowedIPs = 0.0.0.0/0 | sudo tee -a $wireguard_config_dir
echo PersistentKeepalive = 25 | sudo tee -a $wireguard_config_dir

sudo chmod 600 $wireguard_config_dir

# Start wireguard server
sudo wg-quick up $wireguard_config_dir
`;

export const ENABLE_SSHUTTLE = (node: Node) => `
sshuttle --daemon --dns --disable-ipv6 -r ${node.sshUser}@${node.instanceIp}:${node.serverPort} 0.0.0.0/0 -x ${node.instanceIp}:${node.serverPort} --pidfile=${config().SSHUTTLE_PID_FILE_PATH} -e "ssh -vv -i ${node.clientKeyPath}-ssh -o StrictHostKeyChecking=yes -E ${node.sshLogPath}"
`;

export const ENABLE_SSH = (node: Node) => `
ssh -vv ${node.sshUser}@${node.instanceIp} -f -N -L ${node.proxyLocalPort}:0.0.0.0:${node.proxyRemotePort} -p ${node.serverPort} -i ${node.clientKeyPath}-ssh -o StrictHostKeyChecking=yes -E ${node.sshLogPath}
`;

export const ENABLE_LINUX_KILLSWITCH = () => `
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
sudo ufw allow out from any to 10.0.0.1/24
sudo ufw allow out from any to 10.0.0.2/24

for host in $\{hosts[@]}; do
    eval "sudo ufw allow out from any to $\{host/:/ port }"
done

sudo ufw reload
`;

export const DISABLE_LINUX_KILLSWITCH = () => `
sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0 || true
sudo sysctl -w net.ipv6.conf.default.disable_ipv6=0 || true
sudo ufw disable || true
sudo ufw --force reset || true
`;

export const ENABLE_DARWIN_KILLSWITCH = () => ``;

export const DISABLE_DARWIN_KILLSWITCH = () => ``;
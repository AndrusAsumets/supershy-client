import  { Node } from '../types.ts';
import * as models from '../models.ts';

const { config } = models;

export const PREPARE_SSH = (node: Node) => `
ssh-keygen -t ${node.sshKeyAlgorithm} -b ${node.sshKeyLength} -f ${node.keyPath} -q -N ""
`;

export const ENABLE_SSHUTTLE = (node: Node) => `
sshuttle --daemon --dns --disable-ipv6 -r ${node.sshUser}@${node.instanceIp}:${node.sshPort} 0.0.0.0/0 -x ${node.instanceIp}:${node.sshPort} --pidfile=${config().SSHUTTLE_PID_FILE_PATH} -e "ssh -vv -i ${node.keyPath} -o StrictHostKeyChecking=yes -E ${node.sshLogPath}"
`;

export const ENABLE_SSH = (node: Node) => `
sudo ifconfig utun0 down || true

ssh -vv ${node.sshUser}@${node.instanceIp} -f -N -L ${node.proxyLocalPort}:0.0.0.0:${node.proxyRemotePort} -p ${node.sshPort} -i ${node.keyPath} -o StrictHostKeyChecking=yes -E ${node.sshLogPath}
`;

export const PREPARE_WIREGUARD = (node: Node) => `
wireguard_config_dir=${config().DATA_PATH}/wg0.conf
wg genkey > ${node.keyPath}
wg pubkey < ${node.keyPath} > ${node.keyPath}.pub

echo '[Interface]' | sudo tee -a $wireguard_config_dir
echo 'PrivateKey = ${Deno.readTextFileSync(node.keyPath)}' | sudo tee -a $wireguard_config_dir
echo 'Address = ${node.instanceIp}' | sudo tee -a $wireguard_config_dir
echo 'DNS = 1.1.1.1' | sudo tee -a $wireguard_config_dir
echo '[Peer]' | sudo tee -a $wireguard_config_dir
echo 'Endpoint = :51820' | sudo tee -a $wireguard_config_dir
echo 'AllowedIPs = 0.0.0.0/0' | sudo tee -a $wireguard_config_dir
`;

export const ENABLE_WIREGUARD = (node: Node) => `

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
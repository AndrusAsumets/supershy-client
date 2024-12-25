import * as models from './models.ts';
const { config } = models;

export const getUserData = (
    proxyUuid: string,
    sshPort: number,
    jwtSecret: string,
) => {
    return `
echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config
echo 'Port ${sshPort}' >> /etc/ssh/sshd_config
sudo systemctl restart ssh

HOST_KEY=$(cat /etc/ssh/ssh_host_ed25519_key.pub | cut -d ' ' -f 2)
ENCODED_HOST_KEY=$(python3 -c 'import sys;import jwt;payload={};payload[\"sshHostKey\"]=sys.argv[1];print(jwt.encode(payload, sys.argv[2], algorithm=\"HS256\"))' $HOST_KEY ${jwtSecret})
curl --request PUT -H 'Content-Type=*\/*' --data $ENCODED_HOST_KEY --url ${config().CLOUDFLARE_BASE_URL}/accounts/${config().CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${config().CLOUDFLARE_KV_NAMESPACE}/values/${proxyUuid} --oauth2-bearer ${config().CLOUDFLARE_API_KEY}

iptables -A INPUT -p tcp --dport ${sshPort} -j ACCEPT
`;
};
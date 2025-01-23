Supershy is a DIY VPN with a rotating exit node.

<p align="center">
  <img width="480" src="/src/ui/assets/videos/supershy-recording-4.gif">
</p>

During its initiation, the client creates two new VPS instances (let's call them
First Node and Second Node) inside Exoscale, Hetzner and/or Digital Ocean containing
nothing else but a SSH server. Next up, it creates a SSH
connection from your machine to the First Node. All of your local TCP (HTTP etc.) 
traffic will be routed through the instance via sshuttle as though you had been
connected to a VPN.
After 30 minutes, the client will automatically connect to the Second Node, then 
creates a new fresh First Node instance for future use, and then eventually 
sunsets the original First Node by destrying it for good. The cycle of renewing 
your exit nodes (and thus IP addresses) will keep repeating itself as long as you 
have the client running. This way you can get stay pretty private, but still 
enjoy decent internet speeds.

Each time a new instance is created, a phonehome call is made from it to
Cloudflare KV containing instance's public host key, which will be then queried
by supershy, and henceforth added to your SSH's known_hosts file. When SSH
client is connecting to the SSH server, StrictHostKeyChecking=yes will be set. 
This adds a layer of security against possible MITM attacks.

The logic behind jumping from one exit node to another is that it helps you to
keep your communications safe. Should anyone try to pinpoint you using your exit
node's IP, then by the time they get to probing the server, the server will have
been long gone.

Supershy's use cases will depend on your possible adversaries. Firstly, if for
some reason you aren't able to use Mullvad, Proton or any other of the mainstream
VPNs either because they are blocked in your region or because you might not
trust them enough, then supershy could be the next option to try. Secondly, if
you would like to have TOR-like experience, yet think TOR is too slow, then
perhaps you should also check out supershy.

The motivation for creating the project derives from the fact that my own
communications started to be intercepted by several malicious nation-state
actors. When either of the two most VPN-s highly distinguished for anonymity did
not help anymore, I started using a single SSH tunnel to which I routed all my
web traffic to. After a while though, I noticed these started to get hacked,
too. It seems it currently takes them 30 minutes to fully deliver their payload,
which led me to reason that if I will be able to change the server before that
might happen, I should able live to fight yet another day. It is also good to
give something back to the humanity as kindness seems to be in short supply
these days everywhere.

### Features
* DIY sshuttle VPN (and/or HTTP/SOCKS5 proxies) through multiple VPS providers.
* Periodically changes VPS nodes and thus your exit IPs.
* Has a web-based UI.
* Includes a connection killswitch toggle for Linux.
* Has an option to create n number of reserve nodes for making sure you do not
connect to the same node twice, therefore reducing risk of a possible MITM attack.
* Redirects all its own traffic (i.e, VPS and CloudFlare API calls) through SSH
tunnels made by the application itself.

### Supported VPS
Exoscale, Hetzner, Digital Ocean.

### Supported countries
Australia, Austria, Brazil, Bulgaria, Canada, Chile, Finland, France, Germany, India, Israel, Japan, Korea, Mexico, Netherlands, Poland, Singapore, South Africa, Spain, Sweden, Switzerland, United Kingdom, United States.

## Installation

```
# supershy-client
git clone git@github.com:AndrusAsumets/supershy-client.git
cd supershy-client
```

```
# Linux
sudo apt install wireguard sshuttle ufw openresolv -y

# Mac
brew install wireguard-tools
brew install sshuttle

# You might also need to add `Defaults timestamp_timeout=-1` to /etc/sudoers, as 
# by default OSX seems to keep forgetting sudo password every 5 minutes (which is 
# needed by sshuttle).
```

```
# Deno
curl -fsSL https://deno.land/install.sh | sh
```

```
# Start supershy
deno task start
```

```
# Supershy's UI can then be accessed locally from: http://localhost:8080
```

```
# Update Config through the supershy's UI.
NODE_RECYCLE_INTERVAL_SEC=How often you would like to recycle the exit nodes
in seconds, defaults to 1800.

NODE_RESERVE_COUNT=The number of fresh VPS nodes you like to have for backup,
defaults to 1.
Whenever possible, the application will try to avoid reconnecting to a Node.
The higher the reserve count for Nodes is, the less likelier it is to happen.
You can disable the whole rotation progress by setting this value to 0 (and
always keep connecting to the same 
original node), however that would kind of defeat the whole purpose of this
project.

SERVER_PORT_RANGE=Colon separated [from:to] range of numbers for a random
selection, defaults to 10000:65535.

DIGITAL_OCEAN_API_KEY
 -> Open https://cloud.digitalocean.com/account/api/tokens
 -> Generate New Token.
 -> Regions: read.
 -> Droplet: create, read, delete.
 -> ssh_key: create, delete.
 -> Click to copy the API key.

EXOSCALE_API_KEY & EXOSCALE_API_SECRET
 -> Open https://portal.exoscale.com
 -> Select IAM.
 -> Select KEYS.
 -> ADD.
 -> Name it.
 -> SELECT: Owner.
 -> CREATE.
 -> Click to copy the key.
 -> Click to copy the secret.

HETZNER_API_KEY
 -> Open https://console.hetzner.cloud/projects
 -> Select your Project.
 -> Security.
 -> API Tokens.
 -> Generate API token.
 -> Name it.
 -> Generate API token.
 -> Click to show.
 -> Click to copy.

The client will expect an API_KEY from at least one of the VPS providers,
but it will pick a random one if multiple were set.

CLOUDFLARE_ACCOUNT_ID
 -> Open https://dash.cloudflare.com
 -> Workers & Pages.
 -> Click to copy Account ID.

CLOUDFLARE_KV_NAMESPACE
 -> https://dash.cloudflare.com
 -> Workers & Pages.
 -> KV.
 -> Create a namespace.
 -> Name it.
 -> Click to copy ID.

CLOUDFLARE_API_KEY
 -> Open https://dash.cloudflare.com/profile/api-tokens
 -> Create Token.
 -> Get started on Create Custom Token from below.
 -> Name it.
 -> Click Select item... from the Permissions, select Workers KV Storage,
    select Edit from select...
 -> Continue to summary.
 -> Make sure it contains "All accounts - Workers KV Storage:Edit" below
    User API Tokens.
 -> Create Token.
 -> Click to copy the API token.
```

```
# Enable supershy
 -> Click Enable on supershy's UI.

Depending on VPS, the first launch might take up to 5 minutes
to have both Nodes prepared, so please be patient.
```

```
# If you selected HTTP_PROXY or SOCKS5_PROXY from the plugins,
then also update your browser's proxy url:
Firefox with HTTP_PROXY:
 -> Open https://support.mozilla.org/en-US/kb/connection-settings-firefox
 -> Check Manual proxy configuration. 
 -> Enter "localhost" for the HTTP field and "8888" for the Port field.
 -> Check "Also use this proxy for HTTPS".
 -> Ok.

 Firefox with SOCKS5_PROXY:
 -> Open https://support.mozilla.org/en-US/kb/connection-settings-firefox
 -> Check Manual proxy configuration. 
 -> Enter "localhost" for the SOCKS Host field and "8888" for the Port field.
 -> Check "SOCKS v5".
 -> Ok.
```

```
# Test that it's all working
 -> Open https://ipleak.net
 -> Make sure its IP matches with the IP found inside Status tab on supershy's UI.
```

```
# Stop supershy
deno task stop
```

```
# Log
tail -f ~/.supershy-data/logs/*.log
```

Safe travels!

Andrus

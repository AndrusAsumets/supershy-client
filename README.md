Supershy is a DIY VPN with a rotating exit node.

<p align="center">
  <img width="480" src="/src/ui/assets/videos/supershy-recording-3.gif">
</p>

During its initiation, the client creates two new VPS instances (let's call them
First Node and Second Node) inside Digital Ocean, Hetzner and/or Vultr containing
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
you would like to have Tor-like experience, yet think Tor is too slow, then
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
* Creates a sshuttle VPN using VPS provider(s) you define.
* Periodically changes VPS nodes and thus your exit IPs.
* Includes a connection killswitch toggle. If enabled, allows for only connections 
made through the VPN to succeed. (Actions -> CONNECTION_KILLSWITCH -> Enabled).
* Uses sshuttle underneath to VPN all your system-wide TCP traffic through VPS.
It appears to be leaking IPv6 requests though, so make sure to have connection 
killswitch enabled at all times.
* Also has support for creating HTTP and SOCKS5 proxies.
* Runs as a daemon process in background, which keeps supershy running even after reboot.
* All application's own requests (i.e, towards VPS providers and CloudFlare) will be
redirected through SSH tunnels made by the application itself.
* Has a web-based UI.
* Has an option to create n number of reserve nodes for making sure you do not
connect to the same node twice, therefore reducing the risc of a possible MITM attack 
happening even more so.

### Changelog
* Upgrading from v0.2.30 to >= v1.0.0 introduces some breaking changes, namely:
the app is now behaving more like a VPN than a proxy, which means that you do not 
need to manually configure proxy on your browser anymore as all TCP requests 
will be routed automatically to the VPS. If you previously had your browser 
manually configured to use the proxy, then please reset your proxy settings back 
to default.
* Features a connecting killswitch.


### Supported VPS
Digital Ocean, Hetzner, Vultr.

### Supported countries
Australia, Brazil, Canada, Chile, Finland, France, Germany, India, Israel, Japan, Korea, Mexico, Netherlands, Poland, Singapore, South Africa, Spain, Sweden, United Kingdom, United States.

## Installation

```
# Linux, MacOS
curl -fsSL https://install.supershy.org | sudo bash -s $(whoami)
```

```
# Supershy's UI can then be accessed locally from: http://localhost:8080
```

```
# Update Config through the supershy's UI.
NODE_RECYCLE_INTERVAL_SEC=How often you would like to recycle the exit nodes in seconds, defaults to 1800.

NODE_RESERVE_COUNT=The number of fresh VPS nodes you like to have for backup, defaults to 1.
You can disable the whole rotation progress by setting this value to 0 (and always keep connecting to the same 
original node), however that would kind of defeat the whole purpose of this project.

SSH_PORT_RANGE=Colon separated [from:to] range of numbers for a random selection, overrides SSH_PORT if set.

DIGITAL_OCEAN_API_KEY
 -> Open https://cloud.digitalocean.com/account/api/tokens
 -> Generate New Token.
 -> Regions: read.
 -> Droplet: create, read, delete.
 -> ssh_key: create, read, delete.
 -> Click to copy the API key.

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

VULTR_API_KEY
 -> Open https://my.vultr.com/settings/#settingsapi
 -> Click Allow all IPv4.
 -> Click Allow all IPv6.
 -> Click to copy the API Key.

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
 -> Click Select item... from the Permissions, select Workers KV Storage, select Edit from select...
 -> Continue to summary.
 -> Make sure it contains "All accounts - Workers KV Storage:Edit" below User API Tokens.
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

## Development

```
# supershy-client
git clone git@github.com:AndrusAsumets/supershy-client.git
cd supershy-client
```

```
# Linux
sudo apt install git unzip ufw build-essential screen sshuttle -y

# Mac
brew install sshuttle
brew install screen
```

```
# Deno
curl -fsSL https://deno.land/install.sh | sh
```

```
deno task start
```

```
# Stop supershy
deno task stop
```

```
# Log
tail -f ~/.supershy-data/logs/*.log
```

```
# Uninstall
sudo bash uninstall.sh
```

Safe travels!

Andrus

Supershy is a DIY SSH tunnel proxy with a rotating exit node.

<p align="center">
  <img width="480" src="/src/ui/assets/videos/supershy-recording-3.gif">
</p>

During its initiation, the client creates two new VPS instances (let's call them
First Node and Second Node) inside Digital Ocean, Hetzner and/or Vultr containing
nothing else but a simple Tinyproxy proxy daemon. Next up, it creates a SSH
tunnel from your machine to the First Node. If you then change your browser's
(or any other app or a system which has basic support for proxying) proxy
settings to http://localhost:8888, all of your network activity will be routed
through the instance via a SSH tunnel. After 30 minutes, the client will
automatically connect to the Second Node, then creates a new fresh First Node
instance for future use, and then eventually sunsets the original First Node by
destrying it for good. The cycle of renewing your exit nodes (and thus IP
addresses) will keep repeating itself as long as you have the client running.
This way you can get stay pretty private, but still enjoy decent internet
speeds.

Each time a new instance is created, a phonehome call is made from it to
Cloudflare KV containing instance's public host key, which will be then queried
by supershy, and henceforth added to your SSH's known_hosts file. When SSH
client is connecting to the SSH server, StrictHostKeyChecking=yes will be set. This adds a layer of security against possible MITM attacks.

The logic behind jumping from one exit node to another is that it helps you to
keep your communications safe. Should anyone try to pinpoint you using your exit
node's IP, then by the time they get to probing the server, the server will have
been long gone.

Supershy's use cases will depend on your possible adversaries. Firstly, if for
some reason you aren't able to use Mullvad, Proton or any other of the mainstream
VPNs either because they are blocked in your region or because you might not
trust them enough, then Supershy could be the next option to try. Secondly, if
you would like to have Tor-like experience, yet think Tor is too slow, then
perhaps you should also check out Supershy.

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
* Creates a SSH tunnel proxy using VPS provider(s) you define.
* Periodically changes VPS nodes and thus your exit IP.
* Allows for routing all your system-wide TCP traffic towards proxy using tun2proxy.
Has to be first checked from the UI (Config -> PROXY_SYSTEM_WIDE -> Enabled).
* Includes a killswitch toggle, hence only connections made towards proxy will succeed.
(Config -> CONNECTION_KILLSWITCH -> Enabled)
* Runs as a daemon process in background, keeps Supershy running even after reboot.
* All application's own requests (i.e, towards VPS providers and CloudFlare) will be
redirected through SSH tunnels made by the application itself.
* Has a web-based UI.

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
# Update Config through the Supershy's UI.
PROXY_RECYCLE_INTERVAL_SEC=how often you would like to recycle the exit nodes in seconds, defaults to 1800.

SSH_PORT_RANGE=colon separated [from:to] range of numbers for a random selection, overrides SSH_PORT if set.

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
# Enable Supershy
 -> Click Enable Proxy on Supershy's UI.

Depending on VPS, the first launch might take up to 10 minutes
to have both Nodes prepared, so please be patient.
```

```
# Update your browser's proxy url:
Firefox
 -> Open https://support.mozilla.org/en-US/kb/connection-settings-firefox
 -> Check Manual proxy configuration. 
 -> Enter "localhost" for the HTTP field and "8888" for the Port field.
 -> Check "Also use this proxy for HTTPS".
 -> Ok.
```

```
# Test that it's all working
 -> Open https://ipleak.net
 -> Make sure its IP matches with the IP found inside Status tab on Supershy's UI.
```

## Development

```
# supershy-client
git clone git@github.com:AndrusAsumets/supershy-client.git
cd supershy-client
```

```
# Linux
sudo apt install git expect screen unzip ufw build-essential -y

# Mac
brew install expect
brew install screen
```

```
# tun2proxy - optional, if you want to use system-wide proxy.
Will also have to be enabled from the UI later on.
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install tun2proxy
```

```
# Sudo workaround for toggling system-wide proxy and killswitch
# as Deno can not run sudo directly.
echo "$(whoami) ALL=(ALL:ALL) NOPASSWD: /home/$(whoami)/scripts" | sudo tee -a /etc/sudoers
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

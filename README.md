Supershy is a DIY SSH tunnel proxy with a rotating exit node.

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
client is connecting to the SSH server, strict_host_key_checking will be
enabled. This adds a layer of security against possible MITM attacks.

The logic behind jumping from one exit node to another is that it helps you to
keep your communications safe. Should anyone try to pinpoint you using your exit
node's IP, then by the time they get to probing the server, the server will have
been long gone.

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

### User interface preview

1⠀             | 2
:-------------------------:|:-------------------------:
![](/src/ui/assets/images/supershy-screenshot-top-1.png)  |  ![](/src/ui/assets/images/supershy-screenshot-bottom-1.png)

### Installation (properly tested only on Debian-based Linux thus far)

```
# Linux
curl -fsSL https://install.supershy.org | sudo bash -s $(whoami)
```

```
# Supershy's UI can be accessed locally from: http://localhost:8080
```

```
# Update Config through the Supershy's UI.
PROXY_RECYCLE_INTERVAL_SEC=how often you would like to recycle the exit nodes in seconds, defaults to 1800.

SSH_PORT_RANGE=colon separated [from:to] range of numbers for a random selection, overrides SSH_PORT if set.

DIGITAL_OCEAN_API_KEY=
 -> Open https://cloud.digitalocean.com/account/api/tokens
 -> Generate New Token.
 -> Regions: read.
 -> Droplet: create, read, delete.
 -> ssh_key: create, read, delete.
 -> Click to copy the API key.

HETZNER_API_KEY=
 -> Open https://console.hetzner.cloud/projects
 -> Select your Project.
 -> Security.
 -> API Tokens.
 -> Generate API token.
 -> Name it.
 -> Generate API token.
 -> Click to show.
 -> Click to copy.

VULTR_API_KEY=
 -> Open https://my.vultr.com/settings/#settingsapi
 -> Click Allow all IPv4.
 -> Click Allow all IPv6.
 -> Click to copy the API Key.

The client will expect an API_KEY from at least one of the VPS providers,
but it will pick a random one if multiple were set.

CLOUDFLARE_ACCOUNT_ID=
 -> Open https://dash.cloudflare.com
 -> Workers & Pages.
 -> Click to copy Account ID.

CLOUDFLARE_KV_NAMESPACE=
 -> https://dash.cloudflare.com
 -> Workers & Pages.
 -> KV.
 -> Create a namespace.
 -> Name it.
 -> Click to copy ID.

CLOUDFLARE_API_KEY=
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
 -> Make sure countries of both IP and DNS match with the region of Digital Ocean your supershy is currently connected to.
```

### Development
```
# Deno
https://docs.deno.com/runtime/getting_started/installation
```

```
# Linux
sudo apt install expect screen

# Mac
brew install expect
brew install screen
```

```
# supershy-client
git clone git@github.com:AndrusAsumets/supershy-client.git
cd supershy-client
deno task start
```

```
# Stop supershy
deno task stop
```

```
# Log
tail -f ~/.supershy-client/logs/*.log
```

```
# Uninstall
rm -rf ~/.supershy-data
rm -rf /usr/bin/supershy
systemctl --user stop supershy-daemon.service
systemctl --user disable supershy-daemon.service
sudo rm /etc/systemd/user/supershy-daemon.service
```

Safe travels!

Andrus

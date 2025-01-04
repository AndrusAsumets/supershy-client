# Disable background services.
systemctl --user stop supershy-daemon.service || true
systemctl --user disable supershy-daemon.service || true
sudo rm /etc/systemd/user/supershy-daemon.service || true

launch_agents_dir="/Users/${whoami}/Library/LaunchAgents"
daemon="${launch_agents_dir}/org.supershy.supershyd.plist"
sudo -u $(whoami) launchctl unload $daemon &>/dev/null || true

# Stop application.
sudo pkill -f supershyd || true

# Linux killswitch.
sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0 || true
sudo sysctl -w net.ipv6.conf.default.disable_ipv6=0 || true
sudo ufw disable || true

# MacOS killswitch.
daemon_dir=/Library/LaunchDaemons/org.supershy.firewall.plist
firewall_dir=/usr/local/supershy.firewall.sh
rules_dir=/etc/pf.anchors/supershy.firewall.rules

sudo rm -rf $daemon_dir
sudo rm -rf $firewall_dir
sudo rm -rf $rules_dir

sudo launchctl stop $daemon_dir &>/dev/null || true
sudo launchctl remove $daemon_dir || true
sudo launchctl unload $daemon_dir || true
sudo pfctl -d || true
sudo networksetup -setv6automatic Wi-Fi || true
sudo ifconfig utun0 down || true
sudo networksetup -setv6automatic Ethernet || true

# Clean out application data.
rm -rf ~/.supershy-data
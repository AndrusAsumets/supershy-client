# Disable background services
systemctl --user stop supershy-daemon.service || true
systemctl --user disable supershy-daemon.service || true
sudo rm /etc/systemd/user/supershy-daemon.service || true

launch_agents_dir="/Users/${whoami}/Library/LaunchAgents"
daemon="${launch_agents_dir}/org.supershy.supershyd.plist"
sudo -u $(whoami) launchctl unload $daemon &>/dev/null || true

# Stop application
sudo pkill -f supershyd || true
sudo pkill -f tun2proxy-bin || true

# Clean out application data
rm -rf ~/.supershy-data

# Remove possible tun interface
sudo ip link del tun0 &>/dev/null || true

# Clear out dns
sudo chattr -i /etc/resolv.conf &>/dev/null || true
sudo umount -f /etc/resolv.conf || true

# Linux firewall
sudo ufw disable || true

# MacOS firewall
daemon_dir=/Library/LaunchDaemons/org.supershy.firewall.plist
firewall_dir=/usr/local/bin/supershy.firewall.sh
rules_dir=/etc/pf.anchors/supershy.firewall.rules

sudo rm -rf $daemon_dir
sudo rm -rf $firewall_dir
sudo rm -rf $rules_dir

sudo launchctl stop $daemon_dir &>/dev/null || true
sudo launchctl remove $daemon_dir || true
sudo launchctl unload $daemon_dir || true
sudo pfctl -d || true
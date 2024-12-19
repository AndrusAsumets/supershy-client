#disable background services
systemctl --user stop supershy-daemon.service || true
systemctl --user disable supershy-daemon.service || true
sudo rm /etc/systemd/user/supershy-daemon.service || true

launch_agents_dir="/Users/${whoami}/Library/LaunchAgents"
daemon="${launch_agents_dir}/org.supershy.supershyd.plist"
sudo -u $(whoami) launchctl unload $daemon &>/dev/null || true

# stop application
sudo pkill -f supershyd || true
sudo pkill -f tun2proxy-bin || true

# clean out application data
rm -rf ~/.supershy-data

# remove possible tun interface
sudo ip link del tun0 &>/dev/null || true

# clear out dns
sudo chattr -i "$(realpath /etc/resolv.conf)" &>/dev/null || true
sudo umount -f /etc/resolv.conf || true

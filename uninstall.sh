#disable background services
systemctl --user stop supershy-daemon.service || true
systemctl --user disable supershy-daemon.service || true
sudo rm /etc/systemd/user/supershy-daemon.service || true

$user=$(whoami)
launch_agents_dir="/Users/${user}/Library/LaunchAgents"
daemon="${launch_agents_dir}/org.supershy.supershyd.plist"
sudo -u $user launchctl unload $daemon &>/dev/null || true

# stop application
sudo pkill supershyd || true
sudo pkill tun2proxy-bin || true

# clean out application data
rm -rf ~/.supershy-data

# remove possible tun interface
sudo ip link del tun0 || true

# clear out dns
sudo chattr -i "$(realpath /etc/resolv.conf)" || true
sudo umount -f /etc/resolv.conf || true

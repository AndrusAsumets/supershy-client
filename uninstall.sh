#disable background services
systemctl --user stop supershy-daemon.service || true
systemctl --user disable supershy-daemon.service || true
sudo rm /etc/systemd/user/supershy-daemon.service || true
sudo -u $(whoami) launchctl unload $daemon &>/dev/null || true

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

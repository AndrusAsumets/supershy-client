sudo pkill supershyd || true
sudo pkill tun2proxy-bin || true
rm -rf ~/.supershy-data
systemctl --user stop supershy-daemon.service || true
systemctl --user disable supershy-daemon.service || true
sudo rm /etc/systemd/user/supershy-daemon.service || true
sudo ip link del tun0 || true
sudo umount -f /etc/resolv.conf || true
sudo sysctl net.ipv6.conf.all.disable_ipv6=0 || true
sudo sysctl net.ipv6.conf.default.disable_ipv6=0 || true
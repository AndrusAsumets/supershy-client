distro=$(cat /etc/*release)
case $distro in
    *Ubuntu*)
        sudo apt install unzip expect -y
        ;;
    *Debian*)
        sudo apt install unzip expect -y
        ;;
    *Fedora*)
        sudo dnf install unzip expect -y
        ;;
    *CentOS*)
        yum install unzip expect -y
        ;;
    *)
esac

case $(uname -sm) in
	"Darwin x86_64") target="supershy-macos-x86_64" ;;
	"Darwin arm64") target="supershy-macos-arm64" ;;
	"Linux aarch64") target="supershy-linux-arm64" ;;
	*) target="supershy-linux-x86_64" ;;
esac

user=$1
version="$(curl -s https://version.supershy.org/)"
uri="https://github.com/AndrusAsumets/supershy-client/releases/download/${version}/${target}.zip"
tmp_dir="/tmp"
bin_dir="/usr/bin"
zip="$tmp_dir/supershy.zip"
tmp_exe="$tmp_dir/supershy"
exe="$bin_dir/supershy"
daemon="/etc/systemd/user/supershy-daemon.service"

# remove old installation
sudo rm -rf $exe

# download the binary
curl --fail --location --progress-bar --output "$zip" "$uri"

# unzip
unzip -d "$tmp_dir" -o "$zip"

# move to binaries
sudo mv $tmp_exe $exe

# create daemon service
case $target in
    *"linux"*)
        # remove old daemon service
        rm -f $daemon

        # create new daemon service
        sudo echo '[Unit]' >> $daemon
        sudo echo 'Description=supershy' >> $daemon

        sudo echo '[Service]' >> $daemon
        sudo echo 'ExecStart=supershy' >> $daemon
        sudo echo 'Restart=always' >> $daemon

        sudo echo '[Install]' >> $daemon
        sudo echo 'WantedBy=default.target' >> $daemon

        # run supershy daemon in background
	sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user daemon-reload
        sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user enable supershy-daemon.service
        sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user restart supershy-daemon.service
    ;;
esac

if ! command -v unzip >/dev/null && ! command -v 7z >/dev/null; then
	echo "Error: either unzip or 7z is required to install supershy." 1>&2
	exit 1
fi

case $(uname -sm) in
	"Darwin x86_64") target="supershy-macos-x86_64" ;;
	"Darwin arm64") target="supershy-macos-arm64" ;;
	"Linux aarch64") target="supershy-linux-arm64" ;;
	*) target="supershy-linux-x86_64" ;;
esac

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
if command -v unzip >/dev/null; then
	unzip -d "$tmp_dir" -o "$zip"
else
	7z x -o "$tmp_dir" -y "$zip"
fi

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
        USER=$1
        sudo -u $USER XDG_RUNTIME_DIR="/run/user/$(id -u $USER)" systemctl --user enable supershy-daemon.service
        sudo -u $USER XDG_RUNTIME_DIR="/run/user/$(id -u $USER)" systemctl --user start supershy-daemon.service
    ;;
esac
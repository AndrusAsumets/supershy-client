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
echo $uri

bin_dir="/usb/bin"
zip="/tmp/supershy.zip"
exe="$bin_dir/supershy"
daemon="/etc/systemd/user/supershy-daemon.service"

# remove old installation
rm -f $exe 

# download the binary
curl --fail --location --progress-bar --output "$zip" "$uri"

# unzip
if command -v unzip >/dev/null; then
	unzip -d "$bin_dir" -o "$zip"
else
	7z x -o"$bin_dir" -y "$zip"
fi
chmod +x "$exe"
rm "$zip"

# remove old daemon service
rm -f $daemon

# create new daemon service
tee -a $daemon << END
[Unit]
Description=supershy

[Service]
ExecStart=supershy
Restart=always

[Install]
WantedBy=default.target
END

# run supershy daemon in background
sudo -u $1 XDG_RUNTIME_DIR="/run/user/$(id -u $1)" systemctl --user enable supershy-daemon.service
sudo -u $1 XDG_RUNTIME_DIR="/run/user/$(id -u $1)" systemctl --user start supershy-daemon.service
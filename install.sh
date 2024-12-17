user=$1

# install dependencies
if [[ ! -z $(type -p yum) ]]; then
    sudo yum install unzip expect ufw -y
elif [[ ! -z $(type -p dnf) ]]; then
    sudo dnf install unzip expect ufw -y
elif [[ ! -z $(type -p apt) ]]; then
    sudo apt install unzip expect ufw -y
elif [[ ! -z $(type -p brew) ]]; then
    sudo -u $user brew install unzip
    sudo -u $user brew install expect
else
    echo "Warning: Can't install packages as no package manager was found."
fi

# set platform target
case $(uname -sm) in
	"Darwin x86_64") target="supershy-macos-x86_64" ;;
	"Darwin arm64") target="supershy-macos-arm64" ;;
	"Linux aarch64") target="supershy-linux-arm64" ;;
	*) target="supershy-linux-x86_64" ;;
esac

version="$(curl -s https://version.supershy.org/)"
uri="https://github.com/AndrusAsumets/supershy-client/releases/download/${version}/${target}.zip"
app_id="org.supershy.supershyd"
daemon="/etc/systemd/user/supershy-daemon.service"
data_dir="/home/${user}/.supershy-data"
if [[ $target == *"macos"* ]]; then
    launch_agents_dir="/Users/${user}/Library/LaunchAgents"
    sudo mkdir -p $launch_agents_dir
    sudo chown -R $user $launch_agents_dir
    daemon="${launch_agents_dir}/${app_id}.plist"
    data_dir="/Users/${user}/.supershy-data"
fi
sudo mkdir -p $data_dir
tmp_dir="/tmp"
zip="$tmp_dir/supershy.zip"
tmp_exe="$tmp_dir/supershyd"
exe="$data_dir/supershyd"

# remove old installation
sudo rm -rf $exe

# download the binary
curl --fail --location --progress-bar --output "$zip" "$uri"

# unzip
unzip -d "$tmp_dir" -o "$zip"

# move to binaries
sudo mv $tmp_exe $exe

sudo chown -R $user $exe

# remove old daemon service
rm -f $daemon

# create daemon servicea
case $target in
    *"linux"*)
        sudo echo '[Unit]' >> $daemon
        sudo echo 'Description=supershyd' >> $daemon

        sudo echo '[Service]' >> $daemon
        sudo echo "ExecStart=${exe}" >> $daemon
        sudo echo 'Restart=always' >> $daemon

        sudo echo '[Install]' >> $daemon
        sudo echo 'WantedBy=default.target' >> $daemon

        # run supershy daemon in background
        sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user daemon-reload
        sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user enable supershy-daemon.service
        sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user restart supershy-daemon.service
    ;;
    *"macos"*)
        sudo echo '<?xml version="1.0" encoding="UTF-8"?>' >> $daemon
        sudo echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' >> $daemon
        sudo echo '<plist version="1.0">' >> $daemon
        sudo echo '<dict>' >> $daemon
        sudo echo '<key>Label</key>' >> $daemon
        sudo echo "<string>${app_id}</string>" >> $daemon
        sudo echo '<key>ProgramArguments</key>' >> $daemon
        sudo echo '<array>' >> $daemon
        sudo echo "<string>${exe}</string>" >> $daemon
        sudo echo '</array>' >> $daemon
        sudo echo '<key>RunAtLoad</key>' >> $daemon
        sudo echo '<true/>' >> $daemon
        sudo echo '<key>KeepAlive</key>' >> $daemon
        sudo echo '<true/>' >> $daemon
        sudo echo '</dict>' >> $daemon
        sudo echo '</plist>' >> $daemon

        # run supershy daemon in background
        sudo -u $user launchctl unload $daemon &>/dev/null || true
        sudo -u $user launchctl load $daemon
    ;;
esac

# since deno can not run sudo, yet tun2proxy needs it, hence work around
sudoers_dir=/etc/sudoers
enable_tun="${user} ALL=(ALL:ALL) NOPASSWD: /home/me/.supershy-data/enable-tun.sh"
if ! sudo grep -q "$enable_tun" $sudoers_dir; then
    echo -e $enable_tun | sudo tee -a $sudoers_dir
fi

disable_tun="${user} ALL=(ALL:ALL) NOPASSWD: /home/me/.supershy-data/disable-tun.sh"
if ! sudo grep -q "$disable_tun" $sudoers_dir; then
    echo -e $disable_tun | sudo tee -a $sudoers_dir
fi
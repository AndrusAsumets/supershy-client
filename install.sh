# current user
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
	"Darwin x86_64")
        supershy_target="macos-x86_64"
        tun2proxy_target="x86_64-apple-darwin"
    ;;
	"Darwin arm64")
        supershy_target="macos-arm64"
        tun2proxy_target="aarch64-apple-darwin"
    ;;
	"Linux aarch64")
        supershy_target="linux-arm64"
        tun2proxy_target="aarch64-unknown-linux-gnu"
    ;;
	*)
        supershy_target="linux-x86_64"
        tun2proxy_target="i686-unknown-linux-musl"
    ;;
esac

version="$(curl -s https://version.supershy.org/)"
supershy_uri="https://github.com/AndrusAsumets/supershy-client/releases/download/${version}/supershy-${supershy_target}.zip"
tun2proxy_uri="https://github.com/tun2proxy/tun2proxy/releases/download/v0.6.6/tun2proxy-${tun2proxy_target}.zip"

app_id="org.supershy.supershyd"
daemon="/etc/systemd/user/supershy-daemon.service"
home_dir=$(getent passwd "$user" | cut -d: -f6)
data_dir="${home_dir}/.supershy-data"
usr_bin=/usr/bin
if [[ $supershy_target == *"macos"* ]]; then
    launch_agents_dir="/Users/${user}/Library/LaunchAgents"
    sudo mkdir -p $launch_agents_dir
    sudo chown -R $user $launch_agents_dir
    daemon="${launch_agents_dir}/${app_id}.plist"
    data_dir="/Users/${user}/.supershy-data"
fi
sudo mkdir -p $data_dir
tmp_dir="/tmp"

# file paths
supershy_zip="$tmp_dir/supershy.zip"
tun2proxy_zip="$tmp_dir/tun2proxy.zip"

supershy_tmp_exe="$tmp_dir/supershyd"
tun2proxy_tmp_exe="$tmp_dir/tun2proxy-bin"

supershy_exe="$data_dir/supershyd"
tun2proxy_exe="$data_dir/tun2proxy-bin"

# download
curl --fail --location --progress-bar --output "$supershy_zip" "$supershy_uri"
curl --fail --location --progress-bar --output "$tun2proxy_zip" "$tun2proxy_uri"

# unzip
unzip -d "$tmp_dir" -o "$supershy_zip"
unzip -d "$tmp_dir" -o "$tun2proxy_zip"

# move to binaries
sudo mv $supershy_tmp_exe $supershy_exe
sudo mv $tun2proxy_tmp_exe $tun2proxy_exe

# make user the owner of the binaries
sudo chown -R $user $supershy_exe
sudo chown -R $user $tun2proxy_exe

# link to system binaries
supershy_link="$usr_bin"/supershyd
tun2proxy_link="$usr_bin"/tun2proxy-bin

sudo rm -f supershy_link
sudo rm -f tun2proxy_link

sudo ln -sf $supershy_exe $supershy_link
sudo ln -sf $tun2proxy_exe $tun2proxy_link

# remove old daemon service
rm -f $daemon

# create daemon servicea
case $supershy_target in
    *"linux"*)
        sudo echo '[Unit]' >> $daemon
        sudo echo 'Description=supershyd' >> $daemon

        sudo echo '[Service]' >> $daemon
        sudo echo 'ExecStart=supershyd' >> $daemon
        sudo echo 'Restart=always' >> $daemon

        sudo echo '[Install]' >> $daemon
        sudo echo 'WantedBy=default.target' >> $daemon

        # run supershy daemon in background
        sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user daemon-reload
        sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user enable supershy-daemon.service
        sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user restart supershy-daemon.service

        # since deno can not run sudo, yet tun2proxy needs it, hence work around
        sudoer_dir=/etc/sudoers
        script_dir="${user} ALL=(ALL:ALL) NOPASSWD: /home/${user}/.supershy-data/scripts"
        if ! sudo grep -q "$script_dir" $sudoer_dir; then
            echo -e $script_dir | sudo tee -a $sudoer_dir
        fi
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
        sudo echo "<string>${supershy_exe}</string>" >> $daemon
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
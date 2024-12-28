# Set current user.
user=$1

# install dependencies.
if [[ ! -z $(type -p yum) ]]; then
    sudo yum install unzip ufw sshuttle -y
elif [[ ! -z $(type -p dnf) ]]; then
    sudo dnf install unzip ufw sshuttle -y
elif [[ ! -z $(type -p apt) ]]; then
    sudo apt install unzip  ufw sshuttle -y
elif [[ ! -z $(type -p brew) ]]; then
    sudo -u $user brew install unzip
    sudo -u $user brew install sshuttle
else
    echo "Warning: Can't install packages as no package manager was found."
fi

# Set platform target.
case $(uname -sm) in
	"Darwin x86_64")
        supershy_target="macos-x86_64"
    ;;
	"Darwin arm64")
        supershy_target="macos-arm64"
    ;;
	"Linux aarch64")
        supershy_target="linux-arm64"
    ;;
	*)
        supershy_target="linux-x86_64"
    ;;
esac

version="$(curl -s https://version.supershy.org/)"
supershy_uri="https://github.com/AndrusAsumets/supershy-client/releases/download/${version}/supershy-${supershy_target}.zip"

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
script_dir="${data_dir}/scripts"
sudo mkdir -p $data_dir
tmp_dir="/tmp"

# File paths.
supershy_zip="$tmp_dir/supershy.zip"
supershy_tmp_exe="$tmp_dir/supershyd"
supershy_exe="$data_dir/supershyd"

# Download.
curl --fail --location --progress-bar --output $supershy_zip $supershy_uri

# Unzip.
unzip -d $tmp_dir -o $supershy_zip

# Move to binaries.
sudo mv $supershy_tmp_exe $supershy_exe

# Make user the owner of the binaries.
sudo chown -R $user $supershy_exe

# Link to system binaries.
supershy_link=$usr_bin/supershyd
sudo rm -f supershy_link
sudo ln -sf $supershy_exe $supershy_link

# Remove old daemon service.
rm -f $daemon

# Since deno can not run sudo, yet connection killswitch needs it, hence work around.
sudoer_dir=/etc/sudoers
permission="${user} ALL=(ALL:ALL) NOPASSWD: ${script_dir}"
if ! sudo grep -q "$permission" $sudoer_dir; then
    echo -e $permission | sudo tee -a $sudoer_dir
fi

# Create daemon service.
case $supershy_target in
    *"linux"*)
        sudo echo '[Unit]' >> $daemon
        sudo echo 'Description=supershyd' >> $daemon

        sudo echo '[Service]' >> $daemon
        sudo echo 'ExecStart=supershyd' >> $daemon
        sudo echo 'Restart=always' >> $daemon

        sudo echo '[Install]' >> $daemon
        sudo echo 'WantedBy=default.target' >> $daemon

        # Run supershy daemon in background.
        sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user daemon-reload || true
        sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user enable supershy-daemon.service || true
        sudo -u $user XDG_RUNTIME_DIR="/run/user/$(id -u $user)" systemctl --user restart supershy-daemon.service || true
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

        # Run supershy daemon in background.
        sudo -u $user launchctl unload $daemon &>/dev/null || true
        sudo -u $user launchctl load $daemon || true
    ;;
esac
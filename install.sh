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

bin_dir="$HOME"
zip="/tmp/supershy.zip"
exe="$bin_dir/supershy"

if [ ! -d "$bin_dir" ]; then
	mkdir -p "$bin_dir"
fi

rm -f $exe

curl --fail --location --progress-bar --output "$zip" "$uri"
chmod 700 $zip

if command -v unzip >/dev/null; then
	unzip -d "$bin_dir" -o "$zip"
else
	7z x -o"$bin_dir" -y "$zip"
fi
chmod +x "$exe"
rm "$zip"
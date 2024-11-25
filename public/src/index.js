const socket = io('ws://localhost:8880', {
    reconnectionDelayMax: 1000
});

const $connectToggle = document.getElementsByClassName('connect-toggle')[0];

const updateConnectToggle = (label) => $connectToggle.innerText = label;

const constructConfigLine = (key, value) => {
    const $key = document.createElement('div');
    $key.className = 'config-key';
    $key.innerHTML = key;

    const $value = document.createElement('div');
    $value.className = 'config-value';
    $value.innerHTML = value;

    const $configLine = document.createElement('div');
    $configLine.className = 'config-line';
    $configLine.append($key)
    $configLine.append($value)
    return $configLine;
};

const visibleConfigKeys = [
    'PROXY_INTERVAL_SEC',
    'SSH_PORT_RANGE',
    'SSH_KEY_ALGORITHM',
    'SSH_KEY_LENGTH',
    'DIGITAL_OCEAN_API_KEY',
    'HETZNER_API_KEY',
    'VULTR_API_KEY',
    'INSTANCE_PROVIDERS',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_API_KEY',
    'CLOUDFLARE_KV_NAMESPACE',
    'LOG_PATH',
    'DB_FILE_NAME',
    'WEB_SERVER_PORT',
    'WEB_SOCKET_PORT',
    'PROXY_LOCAL_TEST_PORT',
    'PROXY_LOCAL_PORT',
    'PROXY_AUTO_CONNECT'

]
let isConected = false;

const interact = async () => {
    if (!isConected) {
        isConected = true;
        updateConnectToggle('Connecting ...');
        await fetch('/proxy/connect');
    }
    else {
        isConected = false
        updateConnectToggle('Disconnecting ...');
        await fetch('/proxy/disconnect');
    }
};

socket
    .on('started', (_isConected) => {
        isConected = _isConected;
        updateConnectToggle(
            isConected
                ? 'Disconnect Proxy'
                : 'Connect Proxy'
        );
    })
    .on('config', (config) => {
        $configSection = document.getElementsByClassName('section-content config')[0];
        $configSection.innerText = '';

        Object.keys(config).forEach((key) => {
            visibleConfigKeys.includes(key) && $configSection.append(constructConfigLine(key, config[key]));
        });
    })
    .on('log', (message) => {
        $logSection = document.getElementsByClassName('section-content log')[0];

        Object
            .keys(message)
            .forEach(key => {
                const value = `${key}: ${JSON.stringify(message[key])}<br />`;
                $logSection.innerHTML = value + $logSection.innerHTML;
            });
    });

$connectToggle
    .addEventListener('click', () => interact());
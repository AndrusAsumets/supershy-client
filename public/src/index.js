const socket = io('ws://localhost:8880', {
    reconnectionDelayMax: 1000
});

const $connectToggle = document.getElementsByClassName('connect-toggle')[0];

const updateConnectToggle = (label) => $connectToggle.innerText = label;

const visibleConfigKeys = {
    'PROXY_INTERVAL_SEC': { editable: 'number' },
    'SSH_PORT_RANGE': { editable: 'string' },
    'SSH_KEY_ALGORITHM': { editable: 'string' },
    'SSH_KEY_LENGTH': { editable: 'number' },
    'DIGITAL_OCEAN_API_KEY': { editable: 'string' },
    'HETZNER_API_KEY': { editable: 'string' },
    'VULTR_API_KEY': { editable: 'string' },
    'INSTANCE_PROVIDERS': { editable: false },
    'CLOUDFLARE_ACCOUNT_ID': { editable: 'string' },
    'CLOUDFLARE_API_KEY': { editable: 'string' },
    'CLOUDFLARE_KV_NAMESPACE': { editable: 'string' },
    'WEB_SERVER_PORT': { editable: 'number' },
    'WEB_SOCKET_PORT': { editable: 'number'},
    'PROXY_LOCAL_TEST_PORT': { editable: 'number' },
    'PROXY_LOCAL_PORT': { editable: 'number' },
    'PROXY_AUTO_CONNECT': { editable: false },
    'LOG_PATH': { editable: false },
    'DB_FILE_NAME': { editable: false },
};
let isConected = false;
let config = {};

const constructConfigLine = (key, value, isEditable) => {
    const setChangeListener = (div, listener) => {
        div.addEventListener('blur', listener);
        div.addEventListener('keyup', listener);
        div.addEventListener('paste', listener);
        div.addEventListener('copy', listener);
        div.addEventListener('cut', listener);
        div.addEventListener('delete', listener);
        div.addEventListener('mouseup', listener);
    };

    const $key = document.createElement('div');
    $key.className = 'config-key';
    $key.innerHTML = key;

    const $value = document.createElement('div');
    $value.className = 'config-value';
    $value.innerHTML = value;
    $value.spellcheck = false;
    if (isEditable) {
        $value.className += ' config-editable';
        $value.contentEditable = true;

        setChangeListener($value, (event) => {
            if (visibleConfigKeys[key].editable == 'string') {
                config[key] = String(event.target.innerHTML).replace('<br>', '');
            }
            if (visibleConfigKeys[key].editable == 'number') {
                config[key] = Number(event.target.innerHTML);
            }
            socket.emit('/config/save', config);
        });
    }

    const $configLine = document.createElement('div');
    $configLine.className = 'config-line';
    $configLine.append($key)
    $configLine.append($value)
    return $configLine;
};

const interact = () => {
    config['PROXY_AUTO_CONNECT'] = !config['PROXY_AUTO_CONNECT'];
    socket.emit('/config/save', config);

    if (!isConected) {
        isConected = true;
        updateConnectToggle('Connecting ...');
        socket.emit('/proxy/connect');
    }
    else {
        isConected = false
        updateConnectToggle('Disconnecting ...');
        socket.emit('/proxy/disconnect');
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
    .on('config', (_config) => {
        config = _config;
        $configSection = document.getElementsByClassName('section-content config')[0];
        $configSection.innerText = '';

        Object.keys(config).forEach((key) => {
            visibleConfigKeys[key] && $configSection.append(
                constructConfigLine(key, config[key], visibleConfigKeys[key].editable)
            );
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
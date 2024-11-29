const socket = io('ws://localhost:8880', {
    reconnectionDelayMax: 1000
});

const $connectToggle = document.getElementsByClassName('connect-toggle')[0];
const $providersSection = document.getElementsByClassName('section-content providers')[0];
const $countriesSection = document.getElementsByClassName('section-content countries')[0];
const $configSection = document.getElementsByClassName('section-content config')[0];
const $logSection = document.getElementsByClassName('section-content log')[0];

const visibleConfigKeys = {
    'PROXY_INTERVAL_SEC': { editable: 'number' },
    'SSH_PORT_RANGE': { editable: 'string' },
    'SSH_KEY_ALGORITHM': { editable: 'string' },
    'SSH_KEY_LENGTH': { editable: 'number' },
    'DIGITAL_OCEAN_API_KEY': { editable: 'string' },
    'HETZNER_API_KEY': { editable: 'string' },
    'VULTR_API_KEY': { editable: 'string' },
    'CLOUDFLARE_ACCOUNT_ID': { editable: 'string' },
    'CLOUDFLARE_API_KEY': { editable: 'string' },
    'CLOUDFLARE_KV_NAMESPACE': { editable: 'string' },
    'WEB_SERVER_PORT': { editable: 'number' },
    'WEB_SOCKET_PORT': { editable: 'number'},
    'PROXY_LOCAL_TEST_PORT': { editable: 'number' },
    'PROXY_LOCAL_PORT': { editable: 'number' },
    'LOG_PATH': { editable: false },
    'DB_FILE_PATH': { editable: false },
};
const apiKeys = ['DIGITAL_OCEAN_API_KEY', 'HETZNER_API_KEY', 'VULTR_API_KEY'];
let isConected = false;
let config = {};

const updateConnectToggle = (label) => $connectToggle.innerText = label;

const convertSnakeCaseToPascalCase = (str) => str
    .split('_')
    .map((element) => element.slice(0, 1).toUpperCase() + element.slice(1))
    .join('')

const setChangeListener = (div, listener) => {
    div.addEventListener('focusout', listener);
};

const setClickListener = (div, listener) => {
    div.addEventListener('click', listener);
};

const constructConfigLine = (
    key,
    value,
    isEditable = false,
    hasApiKey = false,
) => {
    const $key = document.createElement('div');
    $key.className = 'line-key';
    $key.innerText = key;

    const $value = document.createElement('div');
    $value.className = `${key} line-value`;
    $value.innerText = value;
    $value.spellcheck = false;
    if (isEditable) {
        $value.className += ' config-editable';
        $value.contentEditable = true;

        if (apiKeys.includes(key) && !hasApiKey) {
            $value.className += ' config-alert';
        }
        else if (!apiKeys.includes(key) && !$value.innerText) {
            $value.className += ' config-alert';
        }

        setChangeListener($value, (event) => {
            if (visibleConfigKeys[key].editable == 'string') {
                config[key] = String(event.target.innerText).replace('\n', '');
            }
            if (visibleConfigKeys[key].editable == 'number') {
                config[key] = Number(event.target.innerText);
            }
            socket.emit('/config/save', config);
        });
    }

    const $configLine = document.createElement('div');
    $configLine.className = 'config-line';
    $configLine.append($key);
    $configLine.append($value);
    return $configLine;
};

const constructGenericLine = (key, option) => {
    const $key = document.createElement('div');
    $key.className = 'line-key';
    $key.innerText = convertSnakeCaseToPascalCase(key);

    if (COUNTRY_CODES[$key.innerText]) {
        $key.innerText = COUNTRY_CODES[$key.innerText];
    }

    const value = config[option].includes(key)
        ? 'Disabled'
        : 'Enabled';
    const $value = document.createElement('div');
    $value.className = `${key} line-value config-editable ${value.toLowerCase()}`;
    $value.innerText = value;
    $value.spellcheck = false;

    setClickListener($value, () => {
        !config[option].includes(key)
            ? config[option].push(key)
            : config[option] = config[option]
                .filter((_key) => _key != key);

        socket.emit('/config/save', config);
    });

    const $configLine = document.createElement('div');
    $configLine.className = 'config-line';
    $configLine.append($key);
    $configLine.append($value);
    return $configLine;
};

const interact = () => {
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

const appendLogMessage = (message, key) => {
    const timeLocale = 'en-UK';
    const timeFormat = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const time = new Date(message[key][0]).toLocaleTimeString(timeLocale, timeFormat);
    message[key].shift();
    const value = `${time} ${key}: ${message[key].join(', ')}\n`;
    $logSection.innerText = value + $logSection.innerText;
};

const createLogMessage = (label) => {
    return {
        'Info': [
            new Date().toISOString(),
            label
        ]
    }
};

socket
    .on('/started', (_isConected) => {
        isConected = _isConected;
        updateConnectToggle(
            isConected
                ? 'Disconnect Proxy'
                : 'Connect Proxy'
        );
    })
    .on('/config', (_config) => {
        config = _config;
        $providersSection.innerText = '';
        $countriesSection.innerText = '';
        $configSection.innerText = '';

        const hasApiKey = apiKeys
            .filter((apiKey) => config[apiKey])
            .length > 0;

        Object.keys(config)
            .forEach((key) => {
                visibleConfigKeys[key] && $configSection.append(
                    constructConfigLine(key, config[key], visibleConfigKeys[key].editable, hasApiKey)
                );
            });

        config.INSTANCE_PROVIDERS
            .sort()
            .forEach((key) => {
                $providersSection.append(
                    constructGenericLine(
                        key,
                        'INSTANCE_PROVIDERS_DISABLED'
                    )
                );
            });

        config.INSTANCE_COUNTRIES
            .sort()
            .forEach((key) => {
                $countriesSection.append(
                    constructGenericLine(
                        key,
                        'INSTANCE_COUNTRIES_DISABLED'
                    )
                );
        });
    })
    .on('/log', (message) => {
        Object
            .keys(message)
            .forEach(key => appendLogMessage(message, key));
    })
    .on('connect', () => {
        appendLogMessage(createLogMessage('Connected to WebSocket.'), 'Info')
    })
    .on('disconnect', () => {
        appendLogMessage(createLogMessage('Disconnected from WebSocket.'), 'Info')
    });

$connectToggle
    .addEventListener('click', () => interact());
const socket = io('ws://localhost:8880', {
    reconnectionDelayMax: 1000
});

const $enablementToggle = document.getElementsByClassName('enablement-toggle')[0];
const $restartToggle = document.getElementsByClassName('restart-toggle')[0];
const $statusSection = document.getElementsByClassName('section-content status')[0];
const $pluginsSection = document.getElementsByClassName('section-content plugins')[0];
const $actionsSection = document.getElementsByClassName('section-content actions')[0];
const $providersSection = document.getElementsByClassName('section-content providers')[0];
const $countriesSection = document.getElementsByClassName('section-content countries')[0];
const $configSection = document.getElementsByClassName('section-content config')[0];
const $logSection = document.getElementsByClassName('section-content log')[0];
const visibleActionKeys = {
    'CONNECTION_KILLSWITCH': { editable: 'boolean' },
};
const visibleConfigKeys = {
    'PROXY_RECYCLE_INTERVAL_SEC': { editable: 'number' },
    'PROXY_RESERVE_COUNT': { editable: 'number' },
    'SSH_PORT_RANGE': { editable: 'string' },
    'SSH_KEY_ALGORITHM': { editable: 'string' },
    'SSH_KEY_LENGTH': { editable: 'number' },
    'DIGITAL_OCEAN_API_KEY': { editable: 'password' },
    'HETZNER_API_KEY': { editable: 'password' },
    'VULTR_API_KEY': { editable: 'password' },
    'CLOUDFLARE_ACCOUNT_ID': { editable: 'password' },
    'CLOUDFLARE_API_KEY': { editable: 'password' },
    'CLOUDFLARE_KV_NAMESPACE': { editable: 'password' },
    'WEB_SERVER_PORT': { editable: 'number' },
    'LOG_PATH': { editable: false },
    'DB_FILE_PATH': { editable: false },
};
const apiKeys = ['DIGITAL_OCEAN_API_KEY', 'HETZNER_API_KEY', 'VULTR_API_KEY'];
const faviconStatus = {
    'connected': ['❊', 'white'],
    'connecting': ['❊', 'blue'],
    'disconnected': ['❊', 'red'],
};
let isProxyEnabled = false;
let config = {};
let proxy = {};

const capitalize = s => s && String(s[0]).toUpperCase() + String(s).slice(1);

const updateEnablementToggle = (label) => $enablementToggle.innerText = label;

const convertSnakeCaseToPascalCase = (str) =>
    str
        .split('_')
        .map((element) => element.slice(0, 1).toUpperCase() + element.slice(1))
        .join(' ');

const setChangeListener = (div, listener) => {
    div.addEventListener('focusout', listener);
};

const setClickListener = (div, listener) => {
    div.addEventListener('click', listener);
};

const constructConfigLine = (
    keys,
    key,
    value,
    emitPath,
    isEditable = false,
    hasApiKey = false,
) => {
    const isEditableBoolean = keys[key].editable === 'boolean';
    const isEditablePassword = keys[key].editable === 'password';
    const isEditableString = keys[key].editable == 'string';
    const isEditableNumber = keys[key].editable == 'number';
    const $key = document.createElement('div');
    $key.className = 'line-key';
    $key.innerText = key;

    const $value = document.createElement('div');
    $value.innerText = value;

    if (isEditableBoolean) {
        $value.innerText = value
            ? 'Enabled'
            : 'Disabled'
    }
    const hasEvents = emitPath
        ? 'has-events'
        : '';
    $value.className = `${key} line-value ${hasEvents} ${$value.innerText.toLowerCase()}`;
    $value.spellcheck = false;

    if (isEditable) {
        $value.className += ' config-editable';

        if (apiKeys.includes(key) && !hasApiKey) {
            $value.className += ' config-alert';
        }
        else if (!apiKeys.includes(key) && !$value.innerText) {
            $value.className += ' config-alert';
        }

        if (value && isEditablePassword) {
            $value.className += ' config-password';
        }

        if (isEditableBoolean) {
            setClickListener($value, () => {
                config[key] = !config[key];
                socket.emit(emitPath, config);
            });
        }
        else {
            $value.contentEditable = true;

            setChangeListener($value, (event) => {
                switch(true) {
                    case isEditableString:
                        config[key] = String(event.target.innerText).replace('\n', '');
                        break;
                    case isEditablePassword:
                        config[key] = String(event.target.innerText).replace('\n', '');
                        break;
                    case isEditableNumber:
                        config[key] = Number(event.target.innerText);
                        break;
                }

                socket.emit(emitPath, config);
            });
        }
    }

    const $configLine = document.createElement('div');
    $configLine.className = 'config-line';
    $configLine.append($key);
    $configLine.append($value);
    return $configLine;
};

const constructGenericLine = (
    key,
    value,
    option,
    emitPath,
    selectMultiple = true,
) => {
    const $key = document.createElement('div');
    $key.className = 'line-key';
    $key.innerText = convertSnakeCaseToPascalCase(key);

    if (COUNTRY_CODES[$key.innerText]) {
        $key.innerText = COUNTRY_CODES[$key.innerText];
    }

    const $value = document.createElement('div');
    const hasEvents = emitPath
        ? 'has-events'
        : '';
    $value.className = `${key} line-value ${hasEvents} config-editable ${value.toLowerCase()}`;
    $value.innerText = value;
    $value.spellcheck = false;

    emitPath && setClickListener($value, () => {
        if (!selectMultiple) {
            config[option] = [];
        }

        !config[option].includes(key)
            ? config[option].push(key)
            : config[option] = config[option]
                .filter((_key) => _key != key);

        socket.emit(emitPath, config);
    });

    const $configLine = document.createElement('div');
    $configLine.className = 'config-line';
    $configLine.append($key);
    $configLine.append($value);
    return $configLine;
};

const start = () => {
    isProxyEnabled = true;
    updateEnablementToggle('Enabling ...');
    socket.emit('/proxy/enable');
};

const stop = () => {
    isProxyEnabled = false
    updateEnablementToggle('Disabling ...');
    socket.emit('/proxy/disable');
};

const interact = () => {
    socket.emit('/config/save', config);
    !isProxyEnabled
        ? start()
        : stop();
};

const appendLogMessage = (message, key) => {
    const timeLocale = 'en-UK';
    const timeFormat = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const time = new Date(message[key][0]).toLocaleTimeString(timeLocale, timeFormat);
    message[key].shift();
    const line = JSON.stringify(message[key][0]).split('');
    line.shift();
    line.pop();
    const value = `${time} ${key}: ${line.join('')}\n`;
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

const changeFavicon = (args) => {
    const [icon, color] = args;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.height = size;
    canvas.width = size;
    const ctx = canvas.getContext('2d');
    ctx.font = `${size}px serif`;
    ctx.fillStyle = color;
    ctx.fillText(icon, 0, size);

    const link = document.createElement('link');
    const oldLinks = document.querySelectorAll('link[rel="shortcut icon"]');
    oldLinks.forEach(e => e.parentNode.removeChild(e));
    link.rel = 'shortcut icon';
    link.href = canvas.toDataURL();
    document.head.appendChild(link);
};

const updateStatus = () => {
    $statusSection.innerText = '';

    const status = [[
        'Connection',
        capitalize(config.CONNECTION_STATUS)
    ],
    [
        'Proxy',
        isProxyEnabled
            ? 'Enabled'
            : 'Disabled'
    ]];

    if (isProxyEnabled && proxy && Object.keys(proxy).length && config.CONNECTION_STATUS == 'connected') {
        status.push(['VPS', convertSnakeCaseToPascalCase(proxy.instanceProvider)]);
        status.push(['Country', COUNTRY_CODES[proxy.instanceCountry]]);
        status.push(['IPv4', proxy.instanceIp]);
        status.push(['Proxies in reserve', `${config.PROXY_CURRENT_RESERVE_COUNT} / ${config.PROXY_RESERVE_COUNT}`]);
    }

    status.forEach((list) => {
        $statusSection.append(
            constructGenericLine(
                list[0],
                list[1],
            )
        );
    });

    changeFavicon(faviconStatus[config.CONNECTION_STATUS]);
};

const updatePlugins = () => {
    $pluginsSection.innerText = '';

    config.PLUGINS
        .sort((a, b) => a.localeCompare(b))
        .forEach((key) => {
            $pluginsSection.append(
                constructGenericLine(
                    key,
                    config['PLUGINS_ENABLED'].includes(key)
                        ? 'Enabled'
                        : 'Disabled',
                    'PLUGINS_ENABLED',
                    '/config/save',
                    false,
                )
            );
        });
};

const updateActions = () => {
    $actionsSection.innerText = '';

    Object.keys(config)
        .forEach((key) => {
            visibleActionKeys[key] && $actionsSection.append(
                constructConfigLine(
                    visibleActionKeys,
                    key,
                    config[key],
                    '/config/save',
                    visibleActionKeys[key].editable,
                )
            );
        });
};

const updateConfig = () => {
    $providersSection.innerText = '';
    $countriesSection.innerText = '';
    $configSection.innerText = '';

    const hasApiKey = apiKeys
        .filter((apiKey) => config[apiKey])
        .length > 0;

    Object.keys(config)
        .forEach((key) => {
            visibleConfigKeys[key] && $configSection.append(
                constructConfigLine(
                    visibleConfigKeys,
                    key,
                    config[key],
                    '/config/save',
                    visibleConfigKeys[key].editable,
                    hasApiKey
                )
            );
        });

    config.INSTANCE_PROVIDERS
        .sort((a, b) => a.localeCompare(b))
        .forEach((key) => {
            $providersSection.append(
                constructGenericLine(
                    key,
                    config['INSTANCE_PROVIDERS_DISABLED'].includes(key)
                        ? 'Disabled'
                        : 'Enabled',
                    'INSTANCE_PROVIDERS_DISABLED',
                    '/config/save'
                )
            );
        });

    config.INSTANCE_COUNTRIES
        .sort((a, b) => COUNTRY_CODES[a].localeCompare(COUNTRY_CODES[b]))
        .forEach((key) => {
            $countriesSection.append(
                constructGenericLine(
                    key,
                    config['INSTANCE_COUNTRIES_DISABLED'].includes(key)
                        ? 'Disabled'
                        : 'Enabled',
                    'INSTANCE_COUNTRIES_DISABLED',
                    '/config/save'
                )
            );
        });
};

const updateAll = () => {
    updatePlugins();
    updateStatus();
    updateActions();
    updateConfig();
};

socket
    .on('/started', (_isProxyEnabled) => {
        isProxyEnabled = _isProxyEnabled;
        updateEnablementToggle(
            isProxyEnabled
                ? 'Disable'
                : 'Enable'
        );
    })
    .on('/config', (_config) => {
        config = _config;
        updateAll();
    })
    .on('/proxy', (_proxy) => {
        proxy = _proxy;
        updateStatus();
    })
    .on('/log', (message) => {
        Object
            .keys(message)
            .forEach(key => appendLogMessage(message, key));
    })
    .on('connect', () => {
        appendLogMessage(createLogMessage('Connected to WebSocket.'), 'Info');
    })
    .on('disconnect', () => {
        appendLogMessage(createLogMessage('Disconnected from WebSocket.'), 'Info');
        changeFavicon(faviconStatus.disconnected);
        isProxyEnabled = false;
        $enablementToggle.innerText = '';
        $restartToggle.innerText = '';
        $statusSection.innerText = '';
        $pluginsSection.innerText = '';
        $actionsSection.innerText = '';
        $providersSection.innerText = '';
        $countriesSection.innerText = '';
        $configSection.innerText = '';
    });

$enablementToggle
    .addEventListener('click', () => interact());

$restartToggle
    .addEventListener('click', () => start());
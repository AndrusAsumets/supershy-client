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
                ? 'Disconnect'
                : 'Connect'
        );
    })
    .on('config', (config) => {
        $configSection = document.getElementsByClassName('section-content config')[0];
        $configSection.innerText = '';

        Object.keys(config).forEach((key) => {
            $configSection.append(constructConfigLine(key, config[key]));
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
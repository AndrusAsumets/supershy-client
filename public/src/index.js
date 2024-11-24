const socket = io('ws://localhost:3000', {
    reconnectionDelayMax: 1000
});

const $connectToggle = document.getElementsByClassName('connect-toggle')[0];
const $content = document.getElementsByClassName('content')[0];

const updateConnectToggle = (label) => $connectToggle.innerText = label;

let isConected = false;

const interact = async () => {
    if (!isConected) {
        isConected = true;
        updateConnectToggle('Connecting ...');
        await fetch('/app/start');
    }
    else {
        isConected = false
        updateConnectToggle('Disconnecting ...');
        await fetch('/app/stop');
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
    .on('log', (message) => Object
        .keys(message)
        .forEach(key => {
            const value = `${key}: ${JSON.stringify(message[key])}`;
            const $element = document.createElement('div');
            $element.className = 'log-item';
            $element.innerHTML = value;
            $content.prepend($element);
        }));

$connectToggle
    .addEventListener('click', () => interact());
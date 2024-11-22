const socket = io('ws://localhost:3000', { reconnectionDelayMax: 10000 });

const $connectToggle = document.getElementsByClassName('connect-toggle')[0];
const $content = document.getElementsByClassName('content')[0];

const updateConnectToggle = (label) => $connectToggle.innerText = label;
let isStarted = false;

const interact = async () => {
    if (!isStarted) {
        isStarted = true;
        updateConnectToggle('Starting ...');
        await fetch('/app/start');
    }
    else {
        isStarted = false
        updateConnectToggle('Stopping ...');
        await fetch('/app/stop');
    }
};

socket
    .on('started', (bool) => {
        isStarted = bool;
        updateConnectToggle(
            bool
                ? 'Stop'
                : 'Start'
        )
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
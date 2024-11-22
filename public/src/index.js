const socket = io('ws://localhost:3000', { reconnectionDelayMax: 10000 });

const $connectToggle = document.getElementsByClassName('connect-toggle')[0];
const $content = document.getElementsByClassName('content')[0];

const updateConnectToggle = (label) => $connectToggle.innerText = label;

const updateConnectStatus = (status) => {
    switch (true) {
        case status == 'connected':
            updateConnectToggle('Stop');
            break;
        case status == 'disconnected':
            updateConnectToggle('Start');
            break;
    }
};

const interact = async () => {
    if ($connectToggle.innerText == 'Start') {
        updateConnectToggle('Starting');
        await fetch('/app/start');
    }
    else {
        updateConnectToggle('Stopping');
        await fetch('/app/stop');
    }
};

socket
    .on('status', (status) => updateConnectStatus(status))
    .on('disconnect', () => updateConnectStatus('disconnected'))
    .on('log', (message) => Object
        .keys(message)
        .forEach(key => {
            const value = `${key}: ${JSON.stringify(message[key])}`;
            const $element = document.createElement('div');
            $element.className = 'log-item';
            $element.innerHTML = value;
            $content.prepend($element);
            console.log(value);
        }));

$connectToggle
    .addEventListener('click', () => interact());
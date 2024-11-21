const socket = io('ws://localhost:3000', { reconnectionDelayMax: 10000 });

const $connectToggle = document.getElementsByClassName('connect-toggle')[0];

const updateConnectToggle = (label) => $connectToggle.innerText = label;

const updateConnectStatus = (status) => {
    switch (true) {
        case status == 'connected':
            updateConnectToggle('disconnect');
            break;
        case status == 'disconnected':
            updateConnectToggle('connect');
            break;
    }
};

const interact = async () => {
    if ($connectToggle.innerText == 'connect') {
        updateConnectToggle('connecting');
        await fetch('/app/start');
    }
    else {
        updateConnectToggle('disconnecting');
        await fetch('/app/stop');
    }
};

socket
    .on('status', (status) => updateConnectStatus(status))
    .on('disconnect', () => updateConnectStatus('disconnected'));

$connectToggle
    .addEventListener('click', () => interact());
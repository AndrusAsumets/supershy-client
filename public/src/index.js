const socket = io('ws://localhost:3000', { reconnectionDelayMax: 10000 });

let status = '';

socket.on('status', (_status) => {
    status = _status;
    document.getElementsByClassName('connection-status')[0].innerText = status;
});

document.getElementsByClassName('connect-toggle')[0].addEventListener('click', () => {
    status != 'active'
        ? socket.emit('start')
        : socket.emit('stop');
});
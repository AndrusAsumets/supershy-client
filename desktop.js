import { app, ipcMain, BrowserWindow, Tray, nativeImage } from 'electron';

app
    .whenReady()
    .then(() => {
        let tray = null;
        let isMinimized = false;

        const window = new BrowserWindow({
            width: 480,
            height: 720,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        });

        // Wayland does not support for it, hence it's not available for Linux anymore.
        'skipTaskbar' in window && window.skipTaskbar(true);
        window.setMenu(null);
        window.setBackgroundColor('black');
        window.loadURL('http://0.0.0.0:8080/');

        window.webContents.on('did-finish-load', () => {
            window.webContents.executeJavaScript(`
                window.ipcRenderer = require('electron').ipcRenderer;
            `);
        });
        window.on('minimize', () => isMinimized = true);
        window.on('restore', () => isMinimized = false);

        ipcMain.on('favicon', (_, data) => {
            const icon = nativeImage.createFromDataURL(data);
            tray && tray.destroy();
            tray = new Tray(icon);

            tray.on('click', () => {
                isMinimized
                    ? window.restore()
                    : window.minimize()
                }
            );
        });
    });
import { app } from 'electron';

/**
 * Startup protocol/app schema registration
 *
 * @param {string} protocol    Startup protocol/app schema to register ("://" must not be included)
 *
 * process.argv[1] will contain the full protocol/app schema through which the app has been started;
 * data can be sent to renderer windows through webContents.send() and ipcRenderer or other means.
 *
 * Useful links:
 * {@link https://electronjs.org/docs/api/app#appsetasdefaultprotocolclientprotocol-path-args-macos-windows}
 * {@link https://electronjs.org/docs/api/web-contents#contentssendchannel-arg1-arg2-}
 * {@link https://electronjs.org/docs/api/ipc-main}
 *
 * @example
 * setAppProtocol('my-app') // loading "my-app://some/thing?param=2" will start the app
 */
export default function setAppProtocol(protocol) {
    app.setAsDefaultProtocolClient(protocol);
    const showProcessArgv = () => console.log('Process args: %o', process.argv);

    if (app.isReady()) showProcessArgv();
    else app.on('ready', showProcessArgv);
    
}
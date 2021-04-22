const electron = require("electron");
var request = require('request');
var fs = require('fs');
process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
const PROTOCOL_SCHEME = "entermedia";
const { dialog } = require('electron');

const findProcess = require('find-process');

const protocol = electron.protocol;
const { app, BrowserWindow, Menu, getCurrentWindow, Tray, shell } = require("electron");
const { platform } = require("os");

// env
const isDev = false;
const currentVersion = '0.5.1';
// url
const homeUrl = "https://emediafinder.com/app/workspaces/gotoapp.html";

// logos
const appLogo = "/assets/images/emrlogo.png";
const trayLogo = "/assets/images/em20.png";

// exports to renderer
exports.startMediaBoat = startMediaBoat;
exports.loadNewUrl = openWorkspace;
exports.updateWorkSpaces = updateWorkSpaces;
exports.openLocalBrowser = openLocalBrowser;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) { app.quit(); }

// electron components
let mainWindow;
let session;
let mediaBoatClient;
let tray;

let trayMenu = [];
let workSpaces = [];
var mediaPID;
var mediaBoatLog = '';

const createWindow = () => {
    this.mainWindow = new BrowserWindow({
        width: 1920,
        height: 1024,
        icon: __dirname + appLogo,
        webPreferences: {
            nodeIntegration: true,
            nodeIntegrationInWorker: false,
        },
    });

    // No longer onstart
    // getMediaBoat();

    // internal protocol Scheme
    protocol.registerHttpProtocol(PROTOCOL_SCHEME, (req, cb) => {
        const url = req.url.replace('entermedia', 'http');
        this.mainWindow.loadURL(url);
    });

    console.log('loading', homeUrl);
    this.mainWindow.loadURL(homeUrl);
    // Open the DevTools.
    if (isDev) { this.mainWindow.webContents.openDevTools(); }

    // Main Menu
    setMainMenu(this.mainWindow);

    // session (cookies and stuff)
    checkSession(this.mainWindow);

    // tray
    CreateTray([], this.mainWindow);

    //events
    this.mainWindow.on("minimize", (event) => {
        event.preventDefault();
        this.mainWindow.hide();
    });

    this.mainWindow.on("close", (event) => {
        if (!isDev) {
            if (!app.isQuiting) {
                event.preventDefault();
                this.mainWindow.hide();
            } else {
                if (this.mediaBoatClient) KillAllMediaBoatProcesses();
            }
            return false;
        } else {
            if (this.mediaBoatClient) KillAllMediaBoatProcesses();
        }
    });
};

function openWorkspace(url) {
    this.mainWindow.loadURL(url);
}

function updateWorkSpaces(workspaces) {
    UpdateTray(this.mainWindow, workspaces);
}

function setMainMenu(win) {
    const template = [{
        label: "eMedia Finder",
        submenu: [{
            label: "Logout",
            click() {
                this.session.clearStorageData([], function (data) { });
                win.loadURL(homeUrl);
                this.session.clearStorageData([], function (data) { });
                KillAllMediaBoatProcesses();
            }
        }, {
            label: "Refresh", accelerator: "F5", click() { win.reload(); },
        }, {
            label: "Minimize To Tray", click() { win.hide(); },
        }, {
            label: "Exit", click() {
                app.isQuiting = true;
                app.quit();
            },
        }]
    }, {
        label: 'Browser', submenu: [
            { label: "Back", click() { win.webContents.goBack(); }, }]
    }, {
        label: "Edit",
        submenu: [
            { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
            { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
            { type: "separator" },
            { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
            { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
            { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
            { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
        ]
    }, {
        label: 'Help', submenu: [{
            label: "Log", click() {
                const options = {
                    buttons: ['Close'],
                    defaultId: 2,
                    title: 'eMediaBoatLog',
                    message: 'Logs',
                    detail: this.mediaBoatLog
                };
                dialog.showMessageBox(null, options);
            }
        }, {
            label: "version", click() {
                const options = {
                    buttons: ['Close'],
                    defaultId: 2,
                    title: 'Version',
                    message: 'Current version',
                    detail: 'eMediaFinder Desktop Version: ' + currentVersion
                };
                dialog.showMessageBox(null, options);
            },
        }]
    }];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    // Menu.setApplicationMenu(null);
}

// Start MediaBoat
function startMediaBoat(workspaceURL, username, key) {
    console.log('starting mediaboat...')
    var req = getMediaBoat(workspaceURL, username, key, this.mainWindow);
    req.on('pipe', resp => {
        console.log('resp', resp);
    });
    console.log('started mediaboat')
    return req;
}

// open Browser
function openLocalBrowser(url) {
    shell.openExternal(url);
}

function CreateTray(workSpaces, mainWin) {
    this.trayMenu = [];
    if (!this.tray) this.tray = new Tray(__dirname + trayLogo);

    workSpaces.forEach((ws) => {
        this.trayMenu.push({
            label: ws.label,
            click: () => {
                mainWin.show();
                mainWin.loadURL(ws.url);
            }
        });
    });
    DrawTray(mainWin);
    click = 0;
    this.tray.on("click", () => {
        click += 1;
        setTimeout(() => { click = 0; }, 1000);
        if (click >= 2) mainWin.show();
    });
}

function DrawTray(mainWin) {
    this.trayMenu.push({
        label: "Show App",
        click: () => { mainWin.show(); },
    });
    this.trayMenu.push({
        label: "Home",
        click: () => {
            mainWin.show();
            mainWin.loadURL(homeUrl);
        },
    });
    this.trayMenu.push({
        label: "Quit",
        click: () => {
            app.isQuiting = true;
            app.quit();
        },
    });
    this.tray.setToolTip("eMedia Finder");
    var contextMenu = Menu.buildFromTemplate(this.trayMenu);
    this.tray.setContextMenu(contextMenu);
}

function UpdateTray(mainWin, workspaces) {
    newTrayMenu = [];
    newTrayMenu.push({
        label: "Show App",
        click: () => { mainWin.show(); },
    });
    workspaces.forEach((ws) => {
        newTrayMenu.push({
            label: ws.label,
            click: () => {
                mainWin.show();
                mainWin.loadURL(ws.url);
            },
        });
    });
    this.trayMenu = newTrayMenu;
    DrawTray();
}

function checkSession(win) {
    this.session = win.webContents.session;
}

function getMediaBoat(workspaceURL, username, key, mainWin) {
    console.log('workspace', workspaceURL, username, key);
    var dest = `${__dirname}/jars`;
    console.log(process.platform);
    if (process.platform === 'win32') { // windows do not like it. even if we change permissions
        return spawnMediaBoat(workspaceURL, username, key, mainWin);
    } else {
        return downloadFile(workspaceURL + '/finder/install/MediaBoatClient.jar', dest + '/MediaBoatClient.jar', workspaceURL, username, key, mainWin);
    }
    // leaving this here, in case they are needed in the future
    // downloadFile(url + '/lib/commons-codec-1.9.jar', dest + '/lib/commons-codec-1.9.jar');
    // downloadFile(url + '/lib/commons-logging-1.2.jar', dest + '/lib/commons-logging-1.2.jar');
    // downloadFile(url + '/lib/httpclient-4.5.2.jar', dest + '/lib/httpclient-4.5.2.jar');
    // downloadFile(url + '/lib/httpcore-4.4.4.jar', dest + '/lib/httpcore-4.4.4.jar');
    // downloadFile(url + '/lib/httpmime-4.5.2.jar', dest + '/lib/httpmime-4.5.2.jar');
    // downloadFile(url + '/lib/json-simple-1.1.1.jar', dest + '/lib/json-simple-1.1.1.jar');
    // downloadFile(url + '/lib/nv-websocket-client.jar', dest + '/lib/nv-websocket-client.jar');
}

function downloadFile(url, destPath, workspaceURL, username, key, mainWin) {
    var received_bytes = 0;
    var total_bytes = 0;
    var req = request({ method: 'GET', uri: url });

    var out = fs.createWriteStream(destPath);
    req.pipe(out);
    req.on('response', data => {
        // Change the total bytes value to get progress later.
        total_bytes = parseInt(data.headers['content-length']);
        console.log('total bytes', total_bytes);
    });

    req.on('data', chunk => {
        // Update the received bytes
        received_bytes += chunk.length;
        showProgress(received_bytes, total_bytes, workspaceURL, username, key, mainWin);
    });

    return req;
}

// temp
function showProgress(received, total, workspaceURL, username, key, mainWin) {
    var percentage = (received * 100) / total;
    console.log(percentage + "% | " + received + " bytes out of " + total + " bytes.");
    if (percentage === 100) {
        setTimeout(() => { // give some time for buffer to write disk
            if (this.mediaBoatClient && mediaPID) { KillAllMediaBoatProcesses(); }
            spawnMediaBoat(workspaceURL, username, key, mainWin);
        }, 200);
    }
}

function spawnMediaBoat(workspaceURL, username, key, mainWin) {
    const child_process = require("child_process");
    console.log("exec: java -jar MediaBoatClient.jar ", workspaceURL, username, key);
    let jMediaBoat = child_process.spawn("java", ["-jar", "MediaBoatClient.jar", workspaceURL, username, key], {
        stdio: ['pipe', 'pipe', 'pipe'], shell: true, cwd: `${__dirname}/jars`
    });
    mediaPID = jMediaBoat.pid;
    jMediaBoat.stdout.on('data', data => {
        console.log(data.toString());
        if (data.toString() !== 'undefined') { LogMediaBoat(data.toString()); }
        if (data.toString().indexOf('Login complete') >= 0) {
            const newUrl = `${workspaceURL}/finder/find/index.html?entermedia.key=${key}`;
            console.log('Loading index: ', newUrl)
            mainWin.loadURL(newUrl);
        }
    });

    jMediaBoat.on('close', () => {
        console.log('MediaBoat closed pid:' + jMediaBoat.pid);
    });
    FindProcess();
    return jMediaBoat;
}

function LogMediaBoat(msg) {
    if (!this.mediaBoatLog) { this.mediaBoatLog = '' }
    if (msg) {
        const timeElapsed = Date.now();
        const today = new Date(timeElapsed);
        msg = `${today.toISOString()} ${msg} \n`;
        this.mediaBoatLog += msg;
        console.log(msg)
    }
}

function FindProcess() {
    if (process.platform === "win32") {
        LogMediaBoat("Windows Detected");
        findProcess('name', "MediaBoatClient")
            .then(function (list) {
                for (var i = 0; i < list.length; i++) {
                    console.log('Assigning pid windows', list[i].pid);
                    pidToKill = list[i].pid;
                    mediaPID = pidToKill.toString();
                }
            });
        LogMediaBoat(`MediaBoatPID: ${mediaPID}`);
    }
}

if (!isDev) {
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
        app.quit();
    } else {
        app.on('second-instance', (event, commandLine, workingDirectory) => {
            if (this.mainWindow) {
                this.mainWindow.show()
            }
            console.log('length:', commandLine.length);
            if (commandLine.length >= 2) {
                commandLine.forEach(c => {
                    if (c.indexOf(PROTOCOL_SCHEME) !== -1) {
                        this.mainWindow.loadURL(c.replace(PROTOCOL_SCHEME, 'http'));
                    }
                });
            }
        });
        app.on("ready", createWindow);
        app.on("open-url", (event, url) => {
            if (this.mainWindow)
                this.mainWindow.loadURL(url.replace(PROTOCOL_SCHEME, 'http'));
            event.preventDefault();
        });
    }
} else {
    app.on("ready", createWindow);
}

function KillMediaBoatProcess(pid) {
    if (process.platform === 'win32') {
        process.kill(pid);
        const child_process = require("child_process");
        child_process.spawn("taskkill", ["/pid", pid, '/T', '/F'], { // Sometimes it needs a taskkill
            stdio: ['pipe', 'pipe', 'pipe'], shell: true,
        });
    } else
        if (process.platform === "darwin") {
            process.kill(pid);
        } else {
            process.kill(pid + 1);
        }
}

function KillAllMediaBoatProcesses() {
    findProcess('name', "MediaBoatClient").then(list => {
        console.log('processes to kill: ', list.length);
        for (var i = 0; i < list.length; i++) {
            console.log('Found MediaBoat: ', list[i].pid, list[i]);
            KillMediaBoatProcess(list[i].pid);
        }
    });
}
KillAllMediaBoatProcesses();

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        if (mediaPID) { KillMediaBoatProcess(mediaPID); }
        app.quit();
    }
});

app.on("will-quit", () => {
    if (mediaPID) { KillMediaBoatProcess(mediaPID); }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow(); }
});

// register protocol Scheme, only runs on install
app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);


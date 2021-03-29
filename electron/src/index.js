const electron = require("electron");
var request = require('request');
var fs = require('fs');
process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
const PROTOCOL_SCHEME = "entermedia";

const protocol = electron.protocol;
const { app, BrowserWindow, Menu, getCurrentWindow, Tray, shell } = require("electron");

// env
const isDev = false;

// url
const homeUrl = "https://emediafinder.com/app/workspaces/gotoapp.html";
// const homeUrl = "https://emediafinder.com/entermediadb/emshare2/index.html";
// const homeUrl = 'https://notimportant4-30.t47.entermediadb.net/finder/find/startmediaboat.html';
// const homeUrl = "https://alfred-b-ny.entermediadb.net/assets/find/startmediaboat.html";

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
                if (this.mediaBoatClient) process.kill(this.mediaBoatClient.pid + 1);
            }
            return false;
        } else {
            if (this.mediaBoatClient) process.kill(this.mediaBoatClient.pid + 1);
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
                win.reload();
            }
        },
        { label: "Refresh", accelerator: "F5", click() { win.reload(); }, },
        { label: "Exit", click() { app.quit(); }, },

        ]
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
    // var url = 'http://dev.entermediasoftware.com/jenkins/view/EM9DEV/job/MediaBoat/lastSuccessfulBuild/artifact/dist';
    console.log('workspace', workspaceURL, username, key);
    // var url = 'http://localhost:8080/finder/install';
    var dest = `${__dirname}/jars`;
    return downloadFile(workspaceURL + '/finder/install/MediaBoatClient.jar', dest + '/MediaBoatClient.jar', workspaceURL, username, key, mainWin);
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
            if (this.mediaBoatClient && this.mediaBoatClient.pid) process.kill(this.mediaBoatClient.pid + 1);
            const spawn = require("child_process").spawn;
            let jMediaBoat = spawn("java", ["-jar", "MediaBoatClient.jar", workspaceURL, username, key], {
                stdio: ['pipe', 'pipe', 'pipe'], shell: true, cwd: `${__dirname}/jars`
            });
            jMediaBoat.stdout.on('data', data => {
                console.log(data.toString());
                if (data.toString().indexOf('Login complete') >= 0) {
                    const newUrl = `${workspaceURL}/finder/find/index.html?entermedia.key=${key}`;
                    console.log('Loading index: ', newUrl)
                    mainWin.loadURL(newUrl);
                }
            });
        }, 200);
        return this.jMediaBoat;
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

app.on("window-all-closed", () => {
    if (this.mediaBoatClient)
        process.kill(this.mediaBoatClient.pid + 1);
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// register protocol Scheme, only runs on install
app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
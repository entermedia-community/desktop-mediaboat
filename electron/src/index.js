const electron = require("electron");
var request = require('request');
var fs = require('fs');
process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
const PROTOCOL_SCHEME = "entermedia";

const protocol = electron.protocol;
const { app, BrowserWindow, Menu, getCurrentWindow, Tray, shell } = require("electron");

// url
const homeUrl = "https://entermediadb.org/app/workspaces/index.html";
// const homeUrl = "https://em10.entermediadb.org/assets/mediaapp/index.html";
// const homeUrl = "http://localhost:4200";

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
    // this.mainWindow.webContents.openDevTools();

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
        if (!app.isQuiting) {
            event.preventDefault();
            this.mainWindow.hide();
        } else {
            if (this.mediaBoatClient) process.kill(this.mediaBoatClient.pid + 1);
        }
        return false;
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
        label: "EnterMedia",
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
    },
    { label: "back", click() { win.webContents.goBack(); }, },];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    // Menu.setApplicationMenu(null);
}

// Start MediaBoat
function startMediaBoat(workspaceURL, username, key) {
    var req = getMediaBoat(workspaceURL, username, key);
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
    this.tray.setToolTip("EMedia Finder");
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

function getMediaBoat(workspaceURL, username, key) {
    // var url = 'http://dev.entermediasoftware.com/jenkins/view/EM9DEV/job/MediaBoat/lastSuccessfulBuild/artifact/dist';
    console.log('workspace', workspaceURL);
    // var url = 'http://localhost:8080/finder/install';
    var dest = `${__dirname}/jars`
    return downloadFile(workspaceURL + '/install/MediaBoatClient.jar', dest + '/MediaBoatClient.jar', workspaceURL, username, key);
    // leaving this here, in case they are needed in the future
    // downloadFile(url + '/lib/commons-codec-1.9.jar', dest + '/lib/commons-codec-1.9.jar');
    // downloadFile(url + '/lib/commons-logging-1.2.jar', dest + '/lib/commons-logging-1.2.jar');
    // downloadFile(url + '/lib/httpclient-4.5.2.jar', dest + '/lib/httpclient-4.5.2.jar');
    // downloadFile(url + '/lib/httpcore-4.4.4.jar', dest + '/lib/httpcore-4.4.4.jar');
    // downloadFile(url + '/lib/httpmime-4.5.2.jar', dest + '/lib/httpmime-4.5.2.jar');
    // downloadFile(url + '/lib/json-simple-1.1.1.jar', dest + '/lib/json-simple-1.1.1.jar');
    // downloadFile(url + '/lib/nv-websocket-client.jar', dest + '/lib/nv-websocket-client.jar');
}

function downloadFile(url, destPath,workspaceURL, username, key) {
    var received_bytes = 0;
    var total_bytes = 0;

    var req = request({ method: 'GET', uri: url });

    var out = fs.createWriteStream(destPath);
    req.pipe(out);
    req.on('response', function (data) {
        // Change the total bytes value to get progress later.
        total_bytes = parseInt(data.headers['content-length']);
        console.log('total bytes', total_bytes);
    });    

    req.on('data', function (chunk) {
        // Update the received bytes
        received_bytes += chunk.length;
        showProgress(received_bytes, total_bytes, workspaceURL, username, key);
    });

    return req;   
}

// temp
function showProgress(received, total, workspaceURL, username, key) {
    var percentage = (received * 100) / total;
    // console.log(percentage + "% | " + received + " bytes out of " + total + " bytes.");
    if (percentage === 100) {
        setTimeout(() => {
            if (this.mediaBoatClient && this.mediaBoatClient.pid) process.kill(this.mediaBoatClient.pid + 1);
            let spawn = require("child_process").spawn;
            this.mediaBoatClient = spawn("java", ["-jar", "MediaBoatClient.jar", workspaceURL, username, key], {
                stdio: 'inherit', shell: true, cwd: `${__dirname}/jars`
            });
        // this.mainWindow.loadURL(workspaceURL + "?entermedia.key=" + key);
        }, 200);
        return this.mediaBoatClient;
    }
}

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
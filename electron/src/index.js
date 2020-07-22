const electron = require('electron')
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
const PROTOCOL_SCHEME = 'entermedia'

const protocol = electron.protocol
const { app, BrowserWindow, Menu, getCurrentWindow, Tray } = require('electron');

// logos
const appLogo = '/assets/images/emrlogo.png';
const trayLogo = '/assets/images/emrlogo.png';

// exports to renderer
exports.execCmd = execCmd;
exports.startMediaBoat = startMediaBoat;
exports.loadNewUrl = openWorkspace;
exports.updateWorkSpaces = updateWorkSpaces;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

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
    }
  });

  // internal protocol Scheme
  protocol.registerHttpProtocol(PROTOCOL_SCHEME, (req, cb) => {
    mainWindow.loadURL(fullUrl)
  })

  this.mainWindow.loadURL("https://em10.entermediadb.org/assets/mediaapp/index.html");
  // this.mainWindow.loadURL("https://entermediadb.org/app/workspaces/index.html");
  // this.mainWindow.loadURL("http://localhost/electron/index.html");

  // Open the DevTools.
  this.mainWindow.webContents.openDevTools();

  // mine
  setMainMenu(this.mainWindow);
  // session (cookies and stuff)
  checkSession(this.mainWindow);

  // tray
  workspaces = [];
  CreateTray(workspaces, this.mainWindow);

  //events
  this.mainWindow.on('minimize', event => {
    event.preventDefault();
    this.mainWindow.hide();
  });

  this.mainWindow.on('close', event => {
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
  // Add Main Menu workspaces
}

function setMainMenu(win) {
  const template = [{
    label: 'EnterMedia',
    submenu: [{
      label: 'Logout', click() {
        this.session.clearStorageData([], function (data) {
        });
        // this.mainWindow.loadFile(path.join(__dirname, 'index.html'));
        win.reload();
      }
    }, {
      label: 'Refresh',
      accelerator: 'F5',
      click() {
        win.reload();
      }
    }, {
      label: 'Exit', click() {
        app.quit();
      } // accelerator: 'Shift+CmdOrCtrl+H', 
    }]
  }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Executing commands
function execCmd(command) {
  let spawn = require("child_process").spawn;
  cmd = [];
  command.forEach(c => { cmd.push(c); });
  if (this.mediaBoatClient.pid)
    this.mediaBoatClient = spawn("java", cmd, {
      stdio: 'inherit', shell: true, cwd: `${__dirname}/jars`
    });
  console.log(this.mediaBoatClient.pid);
  mediaBoatClient.stdout.on("data", (data) => {
    console.log('data:', data.toString());
  });
  mediaBoatClient.stderr.on("data", (err) => {
    console.log(err.toString());
  });
  mediaBoatClient.on("exit", (code) => {
    console.log(`exitcode: ${code}`);
  });
}

// function startMediaBoat(server, username, key) {
//   let spawn = require("child_process").spawn;
//   this.mediaBoatClient = spawn("java", ["-jar", "MediaBoatClient.jar", server, username, key], {
//     stdio: 'inherit', shell: true, cwd: `${__dirname}/jars`
//   });
//   console.log(this.mediaBoatClient.pid);
//   exec.stdout.on("data", (data) => {
//     console.log('data:', data.toString());
//   });
//   exec.stderr.on("data", (err) => {
//     console.log(err.toString());
//   });
//   exec.on("exit", (code) => {
//     console.log(`exitcode: ${code}`);
//   });
// }

function startMediaBoat(server, username, key) {
  let spawn = require("child_process").spawn;
  this.mediaBoatClient = spawn("java", ["-jar", "MediaBoatClient.jar", server, username, key], {
    stdio: 'inherit', shell: true, cwd: `${__dirname}/jars`
  });
  return this.mediaBoatClient;
}

function CreateTray(workSpaces, mainWin) {
  this.trayMenu = []
  if (!this.tray)
    this.tray = new Tray(__dirname + trayLogo);

  workSpaces.forEach(ws => {
    this.trayMenu.push({
      label: ws.label, click: () => {
        mainWin.show();
        mainWin.loadURL(ws.url);
      }
    });
  });
  DrawTray();
  click = 0;
  this.tray.on('click', () => {
    click += 1;
    setTimeout(() => { click = 0; }, 1000);
    if (click >= 2) mainWin.show();
  });
}

function DrawTray() {
  this.trayMenu.push({ label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } });
  this.tray.setToolTip("EntermediaDB");
  var contextMenu = Menu.buildFromTemplate(this.trayMenu);
  this.tray.setContextMenu(contextMenu);
}

function UpdateTray(mainWin, workspaces) {
  newTrayMenu = [];
  newTrayMenu.push({
    label: 'Show App', click: () => {
      mainWin.show();
    }
  });
  workspaces.forEach(ws => {
    newTrayMenu.push({
      label: ws.label, click: () => {
        mainWin.show();
        mainWin.loadURL(ws.url);
      }
    });
  });
  this.trayMenu = newTrayMenu;
  DrawTray();
}

function checkSession(win) {
  this.session = win.webContents.session
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  process.kill(this.mediaBoatClient.pid + 1);
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('open-url', () => {
  console.log('Open by url thingie');
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('open-url', function (event, data) {
  event.preventDefault();
  console.log(data);
});

// register protocol Scheme, only runs on install
app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);

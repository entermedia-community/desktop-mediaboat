process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

const { app, BrowserWindow, Menu, getCurrentWindow, Tray } = require('electron');
const path = require('path');
const { dirname } = require("path");

// exports to renderer
exports.execCmd = execCmd;
exports.startMediaBoat = startMediaBoat;
exports.loadNewUrl = openWorkspace;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

// var application = require('app'), BrowserWindow = require('browser-window'), Menu = require('menu'), Tray = require('tray'); 
let mainWindow;
let session;
let mediaBoatClient
let tray;

const createWindow = () => {
  // Create the browser window.
  this.mainWindow = new BrowserWindow({
    width: 1920,
    height: 1024,
    icon: __dirname + '/assets/images/em-logo.png',
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInWorker: true,      
    }
  });
  
  // this.mainWindow.loadURL("https://em10.entermediadb.org/assets/mediaapp/index.html");
  this.mainWindow.loadURL("https://entermediadb.org/app/workspaces/index.html");
  // this.mainWindow.loadURL("http://localhost/electron/index.html");
  
  // Open the DevTools.
  // this.mainWindow.webContents.openDevTools();
  
  // mine
  setMainMenu(this.mainWindow);
  // session (cookies and stuff)
  checkSession(this.mainWindow);
  
  // tray
  this.tray = new Tray(__dirname + '/assets/images/em-logo.png');
  
  this.tray.setToolTip("EntermediaDB");
  var contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => {
      this.mainWindow.show();
      console.log('Clicking')
    } },
    { label: 'Quit', click: () => {
      app.isQuiting = true;
      app.quit();
    } }
  ]);
  this.tray.setContextMenu(contextMenu);
  
  this.tray.on('click', () => {
    console.log('clicked tray');
  });
  
  //events
  this.mainWindow.on('minimize',event => {
    event.preventDefault();
    this.mainWindow.hide();
  });
  
  this.mainWindow.on('close', event => {
    if(!app.isQuiting) {
      event.preventDefault();
      this.mainWindow.hide();
    } else {
      process.kill(this.mediaBoatClient.pid+1);
    }
    return false;
  });
  
};

function openWorkspace(url) {
  this.mainWindow.loadURL(url);
}

function setMainMenu(win) {
  const template = [
    {
      label: 'EnterMedia',
      submenu: [{
        label: 'Logout', click() {
          this.session.clearStorageData([], function (data) {
            console.log(data);
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
        }// accelerator: 'Shift+CmdOrCtrl+H', 
      }]
    }
  ];
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
  // exec.stdout.on("data", (data) => {
  //   console.log('data:', data.toString());
  // });  
  // exec.stderr.on("data", (err) => {
  //   console.log(err.toString());
  // });  
  // exec.on("exit", (code) => {
  //   console.log(`exitcode: ${code}`);
  // });
}

function startMediaBoat(server, username, key) {
  let spawn = require("child_process").spawn;
  this.mediaBoatClient = spawn("java", ["-jar", "MediaBoatClient.jar", server, username,key], {
    stdio: 'inherit', shell: true, cwd: `${__dirname}/jars`
  });
  console.log(this.mediaBoatClient.pid);
  exec.stdout.on("data", (data) => {
    console.log('data:', data.toString());
  });  
  exec.stderr.on("data", (err) => {
    console.log(err.toString());
  });  
  exec.on("exit", (code) => {
    console.log(`exitcode: ${code}`);
  });
}

// function createTray() {
//   this.tray = new Tray(__dirname + '/assets/images/em-logo.png');
  
//   this.tray.setToolTip("EntermediaDB");
//   var contextMenu = Menu.buildFromTemplate([
//     { label: 'Show App', click: () => {
//       this.mainWindow.show();
//       console.log('Clicking')
//     } },
//     { label: 'Quit', click: () => {
//       app.isQuiting = true;
//       app.quit();
//     } }
//   ]);
//   this.tray.setContextMenu(contextMenu);
  
//   this.tray.on('click', () => {
//     console.log('clicked tray');
//   });
// }

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



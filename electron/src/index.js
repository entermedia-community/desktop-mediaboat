var fileWatcher = require("chokidar");

const { app, BrowserWindow, Menu, getCurrentWindow } = require('electron');
const path = require('path');

// exports to renderer
exports.execCmd = execCmd;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

let mainWindow ;
let session;

const createWindow = () => {
  // Create the browser window.
  this.mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    icon: __dirname + '/assets/images/em-logo.png',
    webPreferences: {
      nodeIntegration: true
    }
  });
  
  // and load the index.html of the app.
  // this.mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // Open the DevTools.
  this.mainWindow.webContents.openDevTools();
  
  // mine
  setMainMenu(this.mainWindow);
  checkSession(this.mainWindow);
  
};

function setMainMenu(win) {
  const template = [{
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
    },{ 
      label: 'Exit', click() {
        app.quit();         
      }// accelerator: 'Shift+CmdOrCtrl+H', 
    }]
  }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Executing commands
function execCmd(command) {
  let spawn = require("child_process").spawn;
  cmd = ["-c"];
  command.forEach(c => {
    cmd.push(c);
  });
  console.log(cmd.length)
  let exec = spawn("bash", cmd);
  
  exec.stdout.on("data", (data) => {
    console.log('data:', data.toString());
  });  
  exec.stderr.on("data", (err) => {
    // Handle error...
  });  
  exec.on("exit", (code) => {
    console.log(`exitcode: ${code}`);
  });
}

function checkSession(win) {
  this.session = win.webContents.session
}
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
// background-image: url('/entermediadb/mediadb/services/module/asset/downloads/preset/2019/12/f0/94a/image200x200.png')



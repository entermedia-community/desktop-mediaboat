process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

const { app, BrowserWindow, ipcMain, dialog, Menu, Tray } = require('electron');
const path = require('path');
const log = require("electron-log");
const mkdirp  = require('mkdirp')
const FormData = require('form-data');
const fetch = require('electron-fetch').default;
const os = require("os");
const computerName = os.hostname();
const userHomePath = app.getPath('home');
const Store = require('electron-store');

var url = require('url');
var querystring = require('querystring');
var fs = require('fs');

let session = require("electron");
let mainWindow;
let tray;
let trayMenu = [];
var mediaPID;
let entermediakey;

const store = new Store();
const isDev = false;
const appLogo = "/assets/images/emrlogo.png";
const trayLogo = "/assets/images/em20.png";
const selectWorkspaceForm = `file://${__dirname}/selectHome.html`;

const currentVersion = '2.0.2';


//Handle logs with electron-logs
console.log = log.log;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1024,
    icon: __dirname + appLogo,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      nodeIntegrationInWorker: false,
      contextIsolation: false
    },
  });


  var homeUrl = store.get("homeUrl");
  //console.log("Searched " + homeUrl)
  if(!homeUrl) {
      openWorkspace(selectWorkspaceForm);
  }
  else {
      openWorkspace(homeUrl);
  }
  // Open the DevTools.
  if (isDev) { 
    mainWindow.webContents.openDevTools(); 
  }

  // Main Menu
  setMainMenu(mainWindow);

  // and load the index.html of the app.
  //mainWindow.loadFile(path.join(__dirname, 'index.html'));
  //mainWindow.loadURL("http://192.168.100.4:8080/finder/find/index.html?desktop=true");
  //mainWindow.loadURL("https://em10.entermediadb.org/finder/find/index.html?desktop=true");

  checkSession(mainWindow);

  // tray
  CreateTray([], mainWindow);

  //events
  mainWindow.on("minimize", (event) => {
      if (!isDev) {
          event.preventDefault();
          mainWindow.hide();
      }
  });

  mainWindow.on("close", (event) => {
      if (!isDev) {
          if (!app.isQuiting) {
              event.preventDefault();
              mainWindow.hide();
          } 
          return false;
      } 
  });
  
};



if (!isDev) {
  const gotTheLock = app.getVersion()
  // .requestSingleInstanceLock();
  if (!gotTheLock) {
      app.quit();
  } else {
      app.on('second-instance', (event, commandLine, workingDirectory) => {
          if (mainWindow) {
              mainWindow.show()
          }
          console.log('length:', commandLine.length);
          if (commandLine.length >= 2) {
              commandLine.forEach(c => {
                  if (c.indexOf(PROTOCOL_SCHEME) !== -1) {
                      mainWindow.loadURL(c.replace(PROTOCOL_SCHEME, 'http'));
                  }
              });
          }
      });
      app.on("ready", createWindow);
      app.on("open-url", (event, url) => {
          if (mainWindow)
              mainWindow.loadURL(url.replace(PROTOCOL_SCHEME, 'http'));
          event.preventDefault();
      });
  }
} else {
  app.on("ready", createWindow);
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
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


function checkSession(win) {
  session = win.webContents.session;
  //console.log(session.defaultSession);
}

function openWorkspace(homeUrl) {
  var parsedUrl = url.parse(homeUrl, true);
  var qs_ = querystring.stringify(parsedUrl.query)+"&desktop=true"
  var finalUrl = homeUrl.split("?").shift();
  finalUrl = finalUrl.trim()+'?'+qs_
  console.log('Loading... ', finalUrl);
  mainWindow.loadURL(finalUrl);

  checkSession(mainWindow);
}


ipcMain.on('setHomeUrl', (event, url) => {
  store.set("homeUrl", url);
  openWorkspace(url);
});


function setMainMenu(mainWindow) {
  const template = [{
      label: "eMedia Workspace",
      submenu: [
          /*{ 
          label: "Logout",
          click() {
              this.session.clearStorageData([], function (data) { });
              mainWindow.loadURL(homeUrl);
              this.session.clearStorageData([], function (data) { });
              KillAllMediaBoatProcesses();
          }
      }, */{ 
          label: "Open Worspace",
          click() {
              //this.session.clearStorageData([], function (data) { });
              mainWindow.loadURL(selectWorkspaceForm);
              //this.session.clearStorageData([], function (data) { });
              //KillAllMediaBoatProcesses();
          }
      },
      {
          label: "Minimize To Tray", click() { mainWindow.hide(); },
      }, {
          label: "Exit", click() {
              app.isQuiting = true;
              app.quit();
          },
      }]
  }, {
      label: 'Browser', submenu: [
          { 
              label: "Back", click() { mainWindow.webContents.goBack(); }, 
          },
          {
              label: "Refresh", accelerator: "F5", click() { mainWindow.reload(); },
          },
          { 
              label: "Code Inspector", click() { mainWindow.webContents.openDevTools(); }, 
          }
      ]
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
                  detail: 'eMedia Workspace Version: ' + currentVersion
              };
              dialog.showMessageBox(null, options);
          },
      }]
  }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  // Menu.setApplicationMenu(null);
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
          //KillAllMediaBoatProcesses();
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
  this.tray.setToolTip("eMedia Workspace");
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





//Include all Workspace Functions


ipcMain.on('uploadFiles', (event, options) => {
//function uploadFiles(inKey, inSourcepath, inMediadbUrl, inRedirectUrl) {
  let inSourcepath = options["sourcepath"];  
  let inMediadbUrl = options["mediadburl"];
  entermediakey = options["entermediakey"];

  let defaultpath = store.get("uploaddefaultpath");
  
  dialog.showOpenDialog(mainWindow, {
      defaultPath: defaultpath,
      properties: ['openFile', 'multiSelections']
  }).then(result => {
      if(result===undefined) return;
      console.log(result);
      const filePaths = result.filePaths;
      if (filePaths.length > 0) {
        const totalfiles = filePaths.length;
        var directory = filePaths[0];
        store.set("uploaddefaultpath", path.dirname(directory));

        startFilesUpload(filePaths, inSourcepath, inMediadbUrl, options)

        
      }
    });
});


function startFilesUpload(filePaths, inSourcepath, inMediadbUrl, options) {
    let filecount = 0;
    let totalsize = 0;

    //get Filesizes
    filePaths.forEach(function (filename) {
        var stats = fs.statSync(filename);
        var fileSizeInBytes = stats.size;
        totalsize=+fileSizeInBytes;
    });
    let filenamefinal = filePaths[0].replace(userHomePath, ''); //remove user home
    let sourcepath = inSourcepath+'/'+computerName+filenamefinal;
    let categorypath = path.dirname(sourcepath);
    let form1 = new FormData();
    
    if(options["moduleid"] != null && options["entityid"] != null) 
    {
        form1.append('moduleid', options["moduleid"]);
        form1.append('entityid', options["entityid"]);
    }
    //May need stronger path cleanup
    categorypath = categorypath.replace(":","");
    categorypath = categorypath.split(path.sep).join(path.posix.sep);
    //--
    console.log("Category: "+categorypath);
    form1.append('sourcepath', categorypath);
    submitForm(form1, inMediadbUrl + "/services/module/userupload/uploadstart.json", function(){
      let savingPath = inSourcepath + "/" + computerName;
      savingPath = savingPath.replace(":","");
      savingPath = savingPath.split(path.sep).join(path.posix.sep);
      loopFiles(filePaths, savingPath, inMediadbUrl);
      runJavaScript('$("#sidebarUserUploads").trigger("click");');
      runJavaScript('$(window).trigger("ajaxautoreload");');
    });
}

function loopFiles(filePaths, savingPath, inMediadbUrl) {
  filePaths.forEach(function (filename) {
    const file = fs.createReadStream(filename);
    let filenamefinal = filename.replace(userHomePath, ''); //remove user home
    let sourcepath = savingPath+filenamefinal;
    let form = new FormData();
    form.append('sourcepath', sourcepath);
    form.append('file', file); 
    console.log("Uploading: " + sourcepath)
    submitForm(form, inMediadbUrl+"/services/module/asset/create", function() {})
    //Todo if false Exeption
    //filecount++;
  });
}



ipcMain.on('uploadFolder', (event, options) => {
  //uploadFolder(options);
  let inSourcepath = options["sourcepath"];
  let inMediadbUrl = options["mediadburl"];
  entermediakey = options["entermediakey"];
  //let defaultpath = store.get("uploaddefaultpath");
  let defaultpath = "";

  dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'openDirectory']
  }).then(result => {
    //console.log(result.canceled)
    //console.log(result.filePaths)
    var directory = result.filePaths[0];
    if(directory != undefined) {
      store.set("uploaddefaultpath", directory);
      console.log("Directory selected:" + directory);
      startFolderUpload(directory, inSourcepath, inMediadbUrl, options);
    }
  }).catch(err => {
    console.log(err)
  }) 

});



function startFolderUpload(startingdirectory, inSourcepath, inMediadbUrl, options) {
    //let directoryfinal = directory.replace(userHomePath, ''); //remove user home
    let dirname = path.basename(startingdirectory);
    console.log(dirname);
    
    
    let form1 = new FormData();

    if(options["moduleid"] != null && options["entityid"] != null) 
    {
        form1.append('moduleid', options["moduleid"]);
        form1.append('entityid', options["entityid"]);
    }
    //May need stronger path cleanup
    //categorypath = categorypath.replace(":","");
    //categorypath = categorypath.split(path.sep).join(path.posix.sep);
    //--
    //categorypath = inSourcepath + "/" + dirname;
    let savingPath = inSourcepath + "/" + dirname;
    console.log("Upload start to category:" + savingPath);
    form1.append('sourcepath', savingPath);
    //form.append('totalfilesize', totalsize); Todo: loop over files first
    //console.log(form);
    submitForm(form1, inMediadbUrl + "/services/module/userupload/uploadstart.json", function(){
        loopDirectory(startingdirectory, savingPath, inMediadbUrl);
        runJavaScript('$("#sidebarUserUploads").trigger("click");');
        runJavaScript('refreshEntiyDialog();');
    });
}



  function submitForm(form, formurl, formCompleted){
      const q = url.parse(formurl, true);
      //entermediakey = "cristobalmd542602d7e0ba09a4e08c0a6234578650c08d0ba08d";
      console.log("submitForm Sending Form: "+ formurl);
     
      fetch(formurl, { 
          method: 'POST', 
          body: form, 
          useSessionCookie: true,  
          headers: {"X-tokentype": 'entermedia', "X-token": entermediakey} 
        }).then(function(res) {
            //console.log(res);  //EnterMedia always return 200, need to check for error on body: ToDo: Catch EM real error.
            console.log("submitForm: ok");
            if(typeof formCompleted === 'function') {
                  formCompleted();
            }
        }).catch(err => console.error(err));
      
  }



function runJavaScript(code) {
  console.log("Executed: " + code);
  mainWindow.webContents.executeJavaScript(code);
}

function loopDirectory(directory, savingPath, inMediadbUrl) {
  let filecount = 0;
  let totalsize = 0;
  fs.readdir(directory, (err, files) => {
      
      files.forEach(file => {
          let filepath = path.join(directory,file);
          let stats = fs.statSync(filepath);
          if(stats.isDirectory()) {
              console.log('Subdirectory found: ' + filepath);
              let filenamefinal = filepath.replace(userHomePath, ''); //remove user home
              loopDirectory(filepath, savingPath, inMediadbUrl);
          }
          else {
              let fileSizeInBytes = stats.size;
              totalsize=+fileSizeInBytes;
          }
          
      });    
  });

  //ToDO: Call JSON API to verify files are not already there.

  fs.readdir(directory, (err, files) => {
      files.forEach(file => {
          let filepath = path.join(directory,file);
          let stats = fs.statSync(filepath);
          if(stats.isDirectory()) {
              return;
          }
          let filestream = fs.createReadStream(filepath);
          //console.log(filestream);

          // filepath = filepath.replace("\\","/");
          filepath = path.basename(filepath);

          filepath = filepath.replace(":","");
          let filenamefinal = filepath.replace(userHomePath, ''); //remove user home
          let sourcepath = path.join(savingPath,filenamefinal); 
          sourcepath = sourcepath.split(path.sep).join(path.posix.sep);

          let form = new FormData();
          form.append('sourcepath', sourcepath);
          form.append('file', filestream); 
          console.log('Uploading: '+ sourcepath);
          submitForm(form, inMediadbUrl+"/services/module/asset/create", function(){});
          filecount++;
          //postRequest(inPostUrl, form)
      });
  });

}


//Download

ipcMain.on('selectFolder', (event, options) => {
//function selectFolder(inKey, downloadpaths) {
  entermediakey = options["entermediakey"];
  downloadpaths = options["downloadpaths"];
  //console.log("Download paths ", downloadpaths);
  let defaultpath = store.get("downloaddefaultpath");
  
  dialog.showOpenDialog(mainWindow, {
      defaultPath: defaultpath,
      properties: ['openDirectory']
  }).then(result => {
      if(result===undefined) return;
      //console.log(result);
      let initialPath = result.filePaths[0];
      if(initialPath) {
        store.set("downloaddefaultpath", initialPath);

        downloadpaths.forEach(function (downloadpath) {
          var selectedPath = initialPath;
          if(downloadpath.savetopath != '') {
              selectedPath = selectedPath + downloadpath.savetopath;
          }

          //download method
          downloadfile(downloadpath.url, selectedPath);
        
        });
    }

    //Todo: Close Emdialog


    //openFile(initialPath);
      
  }).catch(err => {
    console.log(err)
  });
});



function downloadfile(fileurl, savepath) {
  /*
  //uses electron's session
  const options = {
      "headers": {"X-tokentype": "entermedia", "X-token": entermediakey}
  };
  */


  fetch(fileurl, { 
    method: 'GET', 
    useSessionCookie: true,  
    headers: {"X-tokentype": 'entermedia', "X-token": entermediakey} 
  }).then(function(res) {
      //console.log(res);  //EnterMedia always return 200, need to check for error on body: ToDo: Catch EM real error.
      if (res.ok) {
        const reader = res.body;
        console.log(reader);

        const contentLength = res.headers.get('content-length');
        // ensure contentLength is available
        if (!contentLength) {
        //throw Error('Content-Length response header unavailable');
        }
        // parse the integer into a base-10 number
        const total = parseInt(contentLength, 10);
        let loaded = 0;
        console.log(contentLength);

        //console.log(response);
        //Create Path
        let dirpath = path.dirname(savepath);
        if (!fs.existsSync(dirpath)) {
            console.log("Creating path: " + dirpath);
            mkdirp.sync(dirpath);
        }
        var out = fs.createWriteStream(savepath);
        res.body.pipe(out);

        out.

        out.on('finish', () => {
            out.close();
            console.log('File downloaded:' + savepath);
        });
    }
  }).catch(err => console.error(err));

}


function openFile(destPath) {
  console.log("Opening: " +destPath);
  shell.openItem(destPath);
}


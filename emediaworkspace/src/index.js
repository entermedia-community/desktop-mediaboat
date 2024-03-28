process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

const { app, BrowserWindow, ipcMain, dialog, Menu, Tray } = require("electron");
const { shell } = require("electron");
const path = require("path");
const log = require("electron-log");
const FormData = require("form-data");
const os = require("os");
const computerName = os.hostname();
const userHomePath = app.getPath("home");
const Store = require("electron-store");
var url = require("url");
var querystring = require("querystring");
var fs = require("fs");
const { EventEmitter } = require("events");
const axios = require("axios");
const extName = require("ext-name");
const { exec } = require("child_process");
let session = require("electron");
let mainWindow;
let entermediakey;

const store = new Store();
const isDev = false;
const appLogo = "/assets/images/emrlogo.png";
const trayLogo = "/assets/images/em20.png";
const selectWorkspaceForm = `file://${__dirname}/selectHome.html`;

//const currentVersion = "2.1.2";
const currentVersion = process.env.npm_package_version;

//Handle logs with electron-logs
log.initialize();
console.log = log.log;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1024,
    icon: __dirname + appLogo,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      nodeIntegrationInWorker: false,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  var homeUrl = store.get("homeUrl");
  //console.log("Searched " + homeUrl)
  if (!homeUrl) {
    openWorkspace(selectWorkspaceForm);
  } else {
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
  const gotTheLock = app.getVersion();
  // .requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on("second-instance", (event, commandLine, workingDirectory) => {
      if (mainWindow) {
        mainWindow.show();
      }
      console.log("length:", commandLine.length);
      if (commandLine.length >= 2) {
        commandLine.forEach((c) => {
          if (c.indexOf(PROTOCOL_SCHEME) !== -1) {
            mainWindow.loadURL(c.replace(PROTOCOL_SCHEME, "http"));
          }
        });
      }
    });
    app.on("ready", createWindow);
    app.on("open-url", (event, url) => {
      if (mainWindow) mainWindow.loadURL(url.replace(PROTOCOL_SCHEME, "http"));
      event.preventDefault();
    });
  }
} else {
  app.on("ready", createWindow);
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
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
  var qs_ = querystring.stringify(parsedUrl.query) + "desktop=true";
  var finalUrl = homeUrl.split("?").shift();
  finalUrl = finalUrl.trim() + "?" + qs_;
  console.log("Loading... ", finalUrl);
  mainWindow.loadURL(finalUrl);

  checkSession(mainWindow);
}

ipcMain.on("setHomeUrl", (event, url) => {
  store.set("homeUrl", url);
  console.log("setHomeUrl called", url);
  openWorkspace(url);
});

function setMainMenu(mainWindow) {
  const template = [
    {
      label: "Workspace",
      submenu: [
        /*{
          label: "Logout",
          click() {
              this.session.clearStorageData([], function (data) { });
              mainWindow.loadURL(homeUrl);
              this.session.clearStorageData([], function (data) { });
              KillAllMediaBoatProcesses();
          }
      }, */ {
          label: "Open Worspace",
          click() {
            //this.session.clearStorageData([], function (data) { });
            mainWindow.loadURL(selectWorkspaceForm);
            //this.session.clearStorageData([], function (data) { });
            //KillAllMediaBoatProcesses();
          },
        },
        {
          label: "Minimize To Tray",
          click() {
            mainWindow.hide();
          },
        },
        {
          label: "Exit",
          click() {
            app.isQuiting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: "Browser",
      submenu: [
        {
          label: "Back",
          click() {
            mainWindow.webContents.goBack();
          },
        },
        {
          label: "Refresh",
          accelerator: "F5",
          click() {
            mainWindow.reload();
          },
        },
        {
          label: "Code Inspector",
          click() {
            mainWindow.webContents.openDevTools();
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
        {
          label: "Select All",
          accelerator: "CmdOrCtrl+A",
          selector: "selectAll:",
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Log",
          click() {
            const options = {
              buttons: ["Close"],
              defaultId: 2,
              title: "eMediaBoatLog",
              message: "Logs",
              detail: this.mediaBoatLog,
            };
            dialog.showMessageBox(null, options);
          },
        },
        {
          label: "About",
          click() {
            const options = {
              buttons: ["Close"],
              defaultId: 2,
              title: "Version",
              message: "Current version",
              detail: process.env.npm_package_name + " Version: " + currentVersion,
            };
            dialog.showMessageBox(null, options);
          },
        },
      ],
    },
  ];
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
      },
    });
  });
  DrawTray(mainWin);
  click = 0;
  this.tray.on("click", () => {
    click += 1;
    setTimeout(() => {
      click = 0;
    }, 1000);
    if (click >= 2) mainWin.show();
  });
}

function DrawTray(mainWin) {
  this.trayMenu.push({
    label: "Show App",
    click: () => {
      mainWin.show();
    },
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
      app.isQuitting = true;
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
    click: () => {
      mainWin.show();
    },
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

ipcMain.on("uploadFiles", (event, options) => {
  console.log("uploadFiles called", options);
  let inSourcepath = options["sourcepath"];
  let inMediadbUrl = options["mediadburl"];
  entermediakey = options["entermediakey"];

  let defaultpath = store.get("uploaddefaultpath");
  dialog
    .showOpenDialog(mainWindow, {
      defaultPath: defaultpath,
      properties: ["openFile", "multiSelections"],
    })
    .then((result) => {
      if (result === undefined) return;
      console.log(result);
      const filePaths = result.filePaths;
      if (filePaths.length > 0) {
        const totalfiles = filePaths.length;
        var directory = filePaths[0];
        store.set("uploaddefaultpath", path.dirname(directory));
        startFilesUpload(filePaths, inSourcepath, inMediadbUrl, options);
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
    totalsize = +fileSizeInBytes;
  });
  let filenamefinal = filePaths[0].replace(userHomePath, ""); //remove user home
  let sourcepath = inSourcepath + "/" + computerName + filenamefinal;
  let categorypath = path.dirname(sourcepath);
  let form1 = new FormData();

  if (options["moduleid"] != null && options["entityid"] != null) {
    form1.append("moduleid", options["moduleid"]);
    form1.append("entityid", options["entityid"]);
  }
  //May need stronger path cleanup
  categorypath = categorypath.replace(":", "");
  categorypath = categorypath.split(path.sep).join(path.posix.sep);
  //--
  console.log("Category: " + categorypath);
  form1.append("sourcepath", categorypath);
  submitForm(
    form1,
    inMediadbUrl + "/services/module/userupload/uploadstart.json",
    function () {
      let savingPath = inSourcepath + "/" + computerName;
      savingPath = savingPath.replace(":", "");
      savingPath = savingPath.split(path.sep).join(path.posix.sep);
      loopFiles(filePaths, savingPath, inMediadbUrl);
      runJavaScript('$("#sidebarUserUploads").trigger("click");');
      runJavaScript('$(window).trigger("ajaxautoreload");');
    },
  );
}

function loopFiles(filePaths, savingPath, inMediadbUrl) {
  filePaths.forEach(function (filename) {
    const file = fs.createReadStream(filename);
    let filenamefinal = filename.replace(userHomePath, ""); //remove user home
    let sourcepath = savingPath + filenamefinal;
    let form = new FormData();
    form.append("sourcepath", sourcepath);
    form.append("file", file);
    console.log("Uploading: " + sourcepath);
    submitForm(
      form,
      inMediadbUrl + "/services/module/asset/create",
      function () {},
    );
    //Todo if false Exeption
    //filecount++;
  });
}

ipcMain.on("uploadFolder", (event, options) => {
  console.log("uploadFolder called", options);

  //uploadFolder(options);
  let inSourcepath = options["sourcepath"];
  let inMediadbUrl = options["mediadburl"];
  entermediakey = options["entermediakey"];
  //let defaultpath = store.get("uploaddefaultpath");
  let defaultpath = "";

  dialog
    .showOpenDialog(mainWindow, {
      properties: ["openFile", "openDirectory"],
    })
    .then((result) => {
      //console.log(result.canceled)
      //console.log(result.filePaths)
      var directory = result.filePaths[0];
      if (directory != undefined) {
        store.set("uploaddefaultpath", directory);
        console.log("Directory selected:" + directory);
        startFolderUpload(directory, inSourcepath, inMediadbUrl, options);
      }
    })
    .catch((err) => {
      console.log(err);
    });
});

function startFolderUpload(
  startingdirectory,
  inSourcepath,
  inMediadbUrl,
  options,
) {
  //let directoryfinal = directory.replace(userHomePath, ''); //remove user home
  let dirname = path.basename(startingdirectory);
  console.log(dirname);

  let form1 = new FormData();

  if (options["moduleid"] != null && options["entityid"] != null) {
    form1.append("moduleid", options["moduleid"]);
    form1.append("entityid", options["entityid"]);
  }
  //May need stronger path cleanup
  //categorypath = categorypath.replace(":","");
  //categorypath = categorypath.split(path.sep).join(path.posix.sep);
  //--
  //categorypath = inSourcepath + "/" + dirname;
  let savingPath = inSourcepath + "/" + dirname;
  console.log("Upload start to category:" + savingPath);
  form1.append("sourcepath", savingPath);
  //form.append('totalfilesize', totalsize); Todo: loop over files first
  //console.log(form);
  submitForm(
    form1,
    inMediadbUrl + "/services/module/userupload/uploadstart.json",
    function () {
      loopDirectory(startingdirectory, savingPath, inMediadbUrl);
      runJavaScript('$("#sidebarUserUploads").trigger("click");');
      runJavaScript("refreshEntiyDialog();");
    },
  );
}

function submitForm(form, formurl, formCompleted) {
  const q = url.parse(formurl, true);
  //entermediakey = "cristobalmd542602d7e0ba09a4e08c0a6234578650c08d0ba08d";
  console.log("submitForm Sending Form: " + formurl);

  fetch(formurl, {
    method: "POST",
    body: form,
    useSessionCookie: true,
    headers: { "X-tokentype": "entermedia", "X-token": entermediakey },
  })
    .then(function (res) {
      //console.log(res);  //EnterMedia always return 200, need to check for error on body: ToDo: Catch EM real error.
      console.log("submitForm: ok");
      if (typeof formCompleted === "function") {
        formCompleted();
      }
    })
    .catch((err) => console.error(err));
}

function runJavaScript(code) {
  console.log("Executed: " + code);
  mainWindow.webContents.executeJavaScript(code);
}

function loopDirectory(directory, savingPath, inMediadbUrl) {
  let filecount = 0;
  let totalsize = 0;
  fs.readdir(directory, (err, files) => {
    files.forEach((file) => {
      let filepath = path.join(directory, file);
      let stats = fs.statSync(filepath);
      if (stats.isDirectory()) {
        console.log("Subdirectory found: " + filepath);
        let filenamefinal = filepath.replace(userHomePath, ""); //remove user home
        loopDirectory(filepath, savingPath, inMediadbUrl);
      } else {
        let fileSizeInBytes = stats.size;
        totalsize = +fileSizeInBytes;
      }
    });
  });

  //ToDO: Call JSON API to verify files are not already there.

  fs.readdir(directory, (err, files) => {
    files.forEach((file) => {
      let filepath = path.join(directory, file);
      let stats = fs.statSync(filepath);
      if (stats.isDirectory()) {
        return;
      }
      let filestream = fs.createReadStream(filepath);
      //console.log(filestream);

      // filepath = filepath.replace("\\","/");
      filepath = path.basename(filepath);

      filepath = filepath.replace(":", "");
      let filenamefinal = filepath.replace(userHomePath, ""); //remove user home
      let sourcepath = path.join(savingPath, filenamefinal);
      sourcepath = sourcepath.split(path.sep).join(path.posix.sep);

      let form = new FormData();
      form.append("sourcepath", sourcepath);
      form.append("file", filestream);
      console.log("Uploading: " + sourcepath);
      submitForm(
        form,
        inMediadbUrl + "/services/module/asset/create",
        function () {},
      );
      filecount++;
      //postRequest(inPostUrl, form)
    });
  });
}

//Download

ipcMain.on("selectFolder", (event, options) => {
  console.log("selectFolder called", options);
  //function selectFolder(inKey, downloadpaths) {
  entermediakey = options["entermediakey"];
  downloadpaths = options["downloadpaths"];
  console.log("Download paths ", downloadpaths);
  let defaultpath = store.get("downloaddefaultpath");
  downloadpaths.forEach(function (downloadpath) {
    downloadfile("https://em11.entermediadb.org" + downloadpath.url);
  });
});

ipcMain.on("onOpenFolder", (event, options) => {
  openFolder(options["path"]);
});

ipcMain.on("onOpenFile", (event, file) => {
  let downloadpath = app.getPath("downloads");
  //options["path"]
  
  openFile(downloadpath+"/"+file.itemexportname);

});

// ---------------------- Open file ---------------------

function openFile(path) {
  console.log("Opening: " + path );
  /*
  exec("open", [path] , (error, stdout, stderr) => {
    if (error) {
        console.log(`error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
});


   */
  shell.openPath(path).then((error) => {
    console.log(error);
  });
}

function openFolder(path) {
  shell.showItemInFolder(path);
}

// ----------------------- Download --------------------

class DownloadManager {
  constructor(window_, maxConcurrentDownloads = 4) {
    this.downloads = new Map();
    this.downloadQueue = [];
    this.maxConcurrentDownloads = maxConcurrentDownloads;
    this.currentDownloads = 0;
    this.totalDownloadsCounts = 0;
    this.window = window_;
    this.haveDefaultDownlaodPath = store.has("downloadDefaultPath");
    this.isPaused = false;
  }

  updateDockProgress() {
    // TODO: show progress on the dock.
  }

  updateDockCount() {
    if (["darwin", "linux"].includes(process.platform)) {
      app.badgeCount = this.totalDownloadsCounts;
    }
  }

  startDownloads() {
    this.downloads = store.get("downloadQueue", new Map());
    this.processQueue();
  }

  async downloadFile({
    downloadItemId,
    downloadPath,
    donwloadFilePath,
    header,
    onStarted,
    onCancel,
    onResume,
    onPause,
    onProgress,
    onCompleted,
    onError,
  }) {
    if (!this.haveDefaultDownlaodPath) {
      try {
        const result = dialog.showOpenDialogSync(mainWindow, {
          properties: ["openDirectory", "createDirectory"],
        });
        this.haveDefaultDownlaodPath = true;
        var directory = result[0];
        if (directory != undefined) {
          store.set("downloadDefaultPath", directory);
        }
      } catch (err) {
        onError(err);
        onCancel();
        console.error(err);
        return;
      }
    }

    const fileDownloadedPath =
      store.get("downloadDefaultPath") ?? app.getPath("downloads");

    const info = {
      url: downloadPath,
      filePath: donwloadFilePath,
      directory: fileDownloadedPath,
      headers: header,
      onStarted: (item) => {
        this.downloads.set(downloadItemId, item);
        store.set("downloadQueue", this.downloads);
        onStarted();
      },
      onProgress: (progress, bytesLoaded, filePath) => {
        // TODO: update about the progress.
        onProgress(progress, bytesLoaded, filePath);
      },
      onCancel: (item) => {
        this.downloads.delete(downloadItemId);
        store.set("downloadQueue", this.downloads);
        this.processQueue();
        onCancel(item);
      },
      onPause: () => {
        this.currentDownloads--;
        onPause();
      },
      onResume: () => {
        this.currentDownloads++;
        onResume();
      },
      onCompleted: (file, totalBytes) => {
        onCompleted(file, totalBytes);
        this.downloads.delete(downloadItemId);
        store.set("downloadQueue", this.downloads);
        if (process.platform === "darwin") {
          app.dock.downloadFinished(file);
        }
        this.currentDownloads--;
        this.totalDownloadsCounts--;
        this.updateDockCount();
        this.processQueue();
      },
      onError: onError,
    };

    const downloadPromise = new DownloadItemHelper(info);

    if (this.currentDownloads < this.maxConcurrentDownloads) {
      this.currentDownloads++;
      downloadPromise.start();
    } else {
      this.downloadQueue.push(downloadPromise);
    }
    this.totalDownloadsCounts++;
    this.updateDockCount();
  }

  processQueue() {
    if (
      this.currentDownloads < this.maxConcurrentDownloads &&
      this.downloadQueue.length > 0 &&
      !this.isPaused
    ) {
      const nextDownload = this.downloadQueue.shift();
      this.currentDownloads++;
      nextDownload.start();
    }
  }

  cancelDownload(onlineDownloadableItemId) {
    const download = this.downloads.get(onlineDownloadableItemId);
    if (download) {
      download.cancel();
      this.downloads.delete(onlineDownloadableItemId);
      store.set("downloadQueue", this.downloads);
    }
  }

  pauseDownload(onlineDownloadableItemId) {
    const download = this.downloads.get(onlineDownloadableItemId);
    if (download) {
      download.pause();
    }
  }

  resumeDownload(onlineDownloadableItemId) {
    const download = this.downloads.get(onlineDownloadableItemId);
    if (download) {
      download.resume();
    }
  }

  pauseAllDownloads() {
    this.downloads.forEach((download) => {
      download.pause();
      this.isPaused = true;
    });
  }

  resumeAllDownloads() {
    this.isPaused = false;
    this.downloads.forEach((download) => {
      download.resume();
    });
    this.processQueue();
  }
}

class DownloadItemHelper extends EventEmitter {
  constructor({
    url,
    fileName,
    directory,
    headers,
    onStarted,
    onProgress,
    onCancel,
    onCompleted,
    onPause,
    onResume,
    onError,
    downloadData,
  }) {
    super();
    this.url = url;
    this.fileName = fileName;
    this.directory = directory || this.getDefaultDownloadDirectory();
    this.headers = headers || {};
    this.onStartedCallback = onStarted;
    this.onProgressCallback = onProgress;
    this.onCancelCallback = onCancel;
    this.onCompletedCallback = onCompleted;
    this.filePath = this.fileName
      ? path.join(this.directory, this.fileName)
      : null;
    this.onPauseCallback = onPause;
    this.onResume = onResume;
    this.onError = onError;
    this.store = new Store();
    this.totalBytes = 0;
    this.progress = 0;
    this.status = "idle";
    this.cancelTokenSource = null;
    this.downloadData = downloadData ||
      this.store.get(this.url) || { bytesDownloaded: 0 };
  }

  detectFileName(url, extra, headers) {
    let fileName = decodeURI(path.basename(url));
    let extension = path.extname(url);
    if (!fileName.includes(".")) {
      const contentType = headers["content-type"];
      if (contentType) {
        extension = getFilenameFromMime("", contentType);
        fileName += extension ? extension : ".txt"; // Default to .txt if extension not found
      } else {
        fileName += ".txt"; // Default to .txt if content-type header not found
      }
    }

    if (extra) {
      let count = 1;
      let baseName = fileName.replace(extension, "");

      while (fs.existsSync(path.join(this.directory, fileName))) {
        count++;
        fileName = `${baseName}_${count}${extension}`;
      }
    }

    return fileName;
  }

  getDefaultDownloadDirectory() {
    return app.getPath("downloads"); // Default download directory
  }

  async start() {
    if (this.status === "downloading") return;

    this.status = "downloading";
    let headers = { ...this.headers };

    let filePathExists = false;

    if (!filePathExists && !this.filePath) {
      const storedData = this.store.get(this.url);
      if (storedData && storedData.filePath) {
        this.filePath = storedData.filePath;
        this.downloadData = storedData;
        filePathExists = fs.existsSync(this.filePath);
      }
    }

    if (this.filePath) {
      filePathExists = fs.existsSync(this.filePath);
    }

    if (filePathExists) {
      this.downloadData.bytesDownloaded = fs.statSync(this.filePath).size;
      headers["Range"] = `bytes=${this.downloadData.bytesDownloaded}-`;
    }

    this.cancelTokenSource = axios.CancelToken.source();

    try {
      let response = await axios.get(this.url, {
        headers,
        responseType: "stream",
        cancelToken: this.cancelTokenSource.token,
        onDownloadProgress: (progressEvent) => {
          this.totalBytes = progressEvent.total;
          this.progress = Math.round(
            ((this.downloadData.bytesDownloaded + progressEvent.loaded) /
              this.totalBytes) *
              100,
          );
          this.emit("progress", progressEvent);
          if (typeof this.onProgressCallback === "function") {
            this.onProgressCallback(
              progressEvent,
              this.downloadData.bytesDownloaded + progressEvent.loaded,
              this.filePath,
            );
          }
        },
      });

      if (
        filePathExists &&
        this.downloadData.bytesDownloaded >= response.headers["content-length"]
      ) {
        this.fileName = this.detectFileName(this.url, true, response.headers);
        this.filePath = path.join(this.directory, this.fileName);
      }

      if (!filePathExists && !this.filePath) {
        this.fileName = this.detectFileName(this.url, true, response.headers);
        this.filePath = path.join(this.directory, this.fileName);
      }

      if (!filePathExists) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      }

      this.downloadData.filePath = this.filePath;
      this.store.set(this.url, this.downloadData);

      let writer = fs.createWriteStream(this.filePath, {
        flags: this.downloadData.bytesDownloaded == 0 ? "w" : "a",
      });
      response.data.pipe(writer);

      if (typeof this.onStartedCallback === "function") {
        this.onStartedCallback(this);
      }

      await new Promise((resolve, reject) => {
        writer.on("finish", () => {
          this.store.delete(this.url);
          this.status = "completed";
          this.emit("progress", 100);
          if (typeof this.onProgressCallback === "function") {
            this.onProgressCallback(100, this.totalBytes, this.filePath);
          }
          if (typeof this.onCompletedCallback === "function") {
            this.onCompletedCallback(this.filePath, this.totalBytes);
          }
          resolve();
        });

        writer.on("error", (err) => {
          this.status = "failed";
          this.store.set(this.url, this.downloadData);
          reject(err);
        });
      });
    } catch (err) {
      if (typeof this.onError === "function") {
        this.onError(err);
      }
      this.status = "failed";
      this.store.set(this.url, this.downloadData);
      throw err;
    }
  }

  pause() {
    if (this.status === "downloading") {
      this.status = "paused";
      this.cancelTokenSource.cancel("Download paused");
      this.onPauseCallback();
      this.store.set(this.url, this.downloadData); // Save downloadData to store on pause
    }
  }

  resume() {
    if (this.status === "paused") {
      this.onResume();
      this.start();
    }
  }

  cancel() {
    if (this.status !== "cancelled") {
      this.cancelTokenSource.cancel("Download cancelled");
      this.store.delete(this.url);
      this.status = "cancelled";
      if (typeof this.onCancelCallback === "function") {
        this.onCancelCallback(this.filePath);
      }
    }
  }
}

const getFilenameFromMime = (name, mime) => {
  const extensions = extName.mime(mime);

  if (extensions.length !== 1) {
    return name;
  }

  return `${name}.${extensions[0].ext}`;
};

const downloadManager = new DownloadManager(mainWindow);

ipcMain.on("pause-download", (event, { orderitemid }) => {
  downloadManager.pauseDownload(orderitemid);
});

ipcMain.on("retry-download", (event, { orderitemid }) => {
  downloadManager.resumeDownload(orderitemid);
});

ipcMain.on("resume-download", (event, { orderitemid }) => {
  downloadManager.resumeDownload(orderitemid);
});

ipcMain.on("cancel-download", (event, { orderitemid }) => {
  downloadManager.cancelDownload(orderitemid);
});

ipcMain.on("start-download", async (event, { orderitemid, file, headers }) => {
  var parsedUrl = url.parse(store.get("homeUrl"), true);
  const items = {
    downloadItemId: orderitemid,
    downloadPath: parsedUrl.protocol + "//" + parsedUrl.host + file.itemdownloadurl,
    header: headers,
    onStarted: () => {
      mainWindow.webContents.send(`download-started-${orderitemid}`);
    },
    onCancel: () => {
      mainWindow.webContents.send(`download-abort-${orderitemid}`);
    },
    onResume: () => {
      mainWindow.webContents.send(`download-resume-${orderitemid}`);
    },
    onPause: () => {
      mainWindow.webContents.send(`download-pause-${orderitemid}`);
    },
    onProgress: (progress, bytesLoaded, filePath) => {
      mainWindow.webContents.send(`download-progress-${orderitemid}`, {
        loaded: bytesLoaded,
        total: progress.total,
      });
    },
    onCompleted: (filePath, totalBytes) => {
      mainWindow.webContents.send(`download-finished-${orderitemid}`, filePath);
      console.log("Download Complete: " +filePath);
    },
    onError: (err) => {
      mainWindow.webContents.send(`download-error-${orderitemid}`, err);
    },
  };
  downloadManager.downloadFile(items);
});

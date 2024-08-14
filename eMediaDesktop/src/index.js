process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  Tray,
  shell,
  ipcRenderer,
} = require("electron");
// let { session } = require("electron");
const path = require("path");
const log = require("electron-log");
const FormData = require("form-data");
// const os = require("os");
// const computerName = os.hostname();
const Store = require("electron-store");
var URL = require("url");
var querystring = require("querystring");
var fs = require("fs");
const { EventEmitter } = require("events");
const axios = require("axios");
const extName = require("ext-name");
// const { exec } = require("child_process");

const userHomePath = app.getPath("home") + "/eMedia/";

const isDev = process.env.NODE_ENV === "development";

if (isDev) {
  try {
    require("electron-reloader")(module, {
      ignore: ["dist", "Activity", "build", "asset"],
    });
  } catch (err) {
    mainWindow.webContents.send("electron-error", err);
  }
}

let mainWindow;
let entermediakey;

//Config
const appLogo = "/assets/images/emrlogo.png";
const trayLogo = "/assets/images/em20.png";

const store = new Store();
const selectWorkspaceForm = `file://${__dirname}/selectHome.html`;

const currentVersion = process.env.npm_package_version;

//Handle logs with electron-logs
log.initialize();
var console = {};
console.log = function (...args) {
  if (mainWindow) {
    mainWindow.webContents.send("electron-log", args);
    // turn on "Preserve log" in the browser console settings to see the logs
  }
  log.log.apply(this, args);
};

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
  app.allowRendererProcessReuse = false;
  if (!homeUrl) {
    openWorkspacePicker(selectWorkspaceForm);
  } else {
    openWorkspace(homeUrl);
  }
  // Open the DevTools.
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Main Menu
  setMainMenu(mainWindow);

  // Session
  checkSession(mainWindow);

  // tray
  CreateTray([], mainWindow);

  // Events
  mainWindow.on("minimize", (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.removeAllListeners("close");
      mainWindow = null;
      app.quit();
    }
    return false;
  });

  mainWindow.on("closed", function () {
    mainWindow = null;
  });

  mainWindow.on("window-all-closed", () => {
    console.log("Closing Main Window... ");
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
};

if (!isDev) {
  const gotTheLock = app.getVersion();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on("second-instance", (_, commandLine) => {
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
  console.log("Closing App...");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (mainWindow) {
    mainWindow.removeAllListeners("close");
    mainWindow.close();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null || BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function checkSession(win) {
  session = win.webContents.session;
  //console.log(session.defaultSession);
}

function openWorkspacePicker(pickerURL) {
  mainWindow.loadURL(pickerURL);
  checkSession(mainWindow);
  mainWindow.once("ready-to-show", () => {
    var workspaces = store.get("workspaces");
    mainWindow.webContents.send("loadworkspaces", {
      ...workspaces,
    });
  });
}

function openWorkspace(homeUrl) {
  var parsedUrl = URL.parse(homeUrl, true);
  var qs_ = querystring.stringify(parsedUrl.query) + "desktop=true";
  var finalUrl = homeUrl.split("?").shift();
  finalUrl = finalUrl.trim() + "?" + qs_;
  console.log("Loading: ", finalUrl);
  mainWindow.loadURL(finalUrl);
  store.set("mediadburl", ""); //reset on restart
  checkSession(mainWindow);
}

ipcMain.on("getWorkDir", () => {
  mainWindow.webContents.send("work-dir", {
    workDir: store.get("workDir"),
    workDirEntity: store.get("workDirEntity"),
  });
});

ipcMain.on("setWorkDirEntity", (_, { entity }) => {
  store.set("workDirEntity", entity);
});

function scanDirectory(directory, maxLevel = 1) {
  var files = fs.readdirSync(directory);
  var folders = {};
  files.forEach((file) => {
    if (file.startsWith(".")) return;
    let filepath = path.join(directory, file);
    let stats = fs.statSync(filepath);
    if (stats.isDirectory() && maxLevel > 0) {
      folders[file] = scanDirectory(filepath, maxLevel - 1);
    }
  });
  return folders;
}

ipcMain.on("select-dirs", async (_, arg) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    defaultPath: arg.currentPath,
  });
  var rootPath = result.filePaths[0];
  scanHotFolders(rootPath);
});

function scanHotFolders(rootPath) {
  var folderTree = scanDirectory(rootPath);
  store.set("workDir", rootPath);
  mainWindow.webContents.send("selected-dirs", {
    rootPath: rootPath,
    folderTree: folderTree,
  });
}

ipcMain.on("scanHotFolders", (_, options) => {
  var rootPath = options["rootPath"];
  scanHotFolders(rootPath);
});

ipcMain.on("setHomeUrl", (event, url) => {
  var workspaces = store.get("workspaces");
  if (workspaces) {
    const exists = workspaces.includes(url);
    if (!exists) {
      workspaces.push(url);
    }
    store.set("workspaces", workspaces);
  } else {
    store.set("workspaces", [url]);
  }
  store.set("homeUrl", url);
  store.set("mediadburl", "");
  openWorkspace(url);
});

var connectionOptions = {};
ipcMain.on("setConnectionOptions", (_, options) => {
  connectionOptions = options;
});

function setMainMenu(mainWindow) {
  const template = [
    {
      label: "Workspace",
      submenu: [
        {
          label: "Change Workspace",
          click() {
            openWorkspacePicker(selectWorkspaceForm);
          },
        },
        {
          type: "separator",
        },
        {
          label: "Exit",
          accelerator: "CmdOrCtrl+Q",
          click() {
            app.isQuiting = true;
            mainWindow.close();
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
          type: "separator",
        },
        {
          label: "Code Inspector",
          accelerator: "CmdOrCtrl+Shift+I",
          click() {
            mainWindow.webContents.openDevTools();
          },
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        {
          label: "Local Drive",
          click() {
            shell.openPath(userHomePath);
          },
        },
        {
          type: "separator",
        },
        {
          label: "Minimize",
          accelerator: "CmdOrCtrl+M",
          click() {
            mainWindow.minimize();
          },
        },
        {
          label: "Maximize",
          accelerator: "CmdOrCtrl+Shift+M",
          click() {
            if (mainWindow.isMaximized()) {
              mainWindow.unmaximize();
            } else {
              mainWindow.maximize();
            }
          },
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        // {
        //   label: "Log",
        //   click() {
        //     const options = {
        //       buttons: ["Close"],
        //       defaultId: 2,
        //       title: "eMediaBoatLog",
        //       message: "Logs",
        //       detail: this.mediaBoatLog,
        //     };
        //     dialog.showMessageBox(null, options);
        //   },
        // },
        {
          label: "About",
          click() {
            const options = {
              buttons: ["Close"],
              defaultId: 2,
              title: "Version",
              message: "Current version",
              detail:
                process.env.npm_package_name + " Version: " + currentVersion,
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
  this.tray.setToolTip("eMedia Library");
  var contextMenu = Menu.buildFromTemplate(this.trayMenu);
  this.tray.setContextMenu(contextMenu);
}

//Include all Workspace Functions
/*
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
    }
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
      function () {}
    );
    //Todo if false Exeption
    //filecount++;
  });
}
*/
ipcMain.on("uploadFolder", (event, options) => {
  console.log("uploadFolder called", options);

  //uploadFolder(options);
  let inSourcepath = options["sourcepath"];
  let inMediadbUrl = options["mediadburl"];
  entermediakey = options["entermediakey"];

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
      mainWindow.webContents.send("electron-error", err);
    });
});

function startFolderUpload(
  startingdirectory,
  inSourcepath,
  inMediadbUrl,
  options
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
    }
  );
}

function submitForm(form, formurl, formCompleted) {
  const q = URL.parse(formurl, true);
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
    .catch((err) => {
      mainWindow.webContents.send("electron-error", err);
      console.error(err);
    });
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
        function () {}
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

// ---------------------- Open file ---------------------

function openFile(path) {
  console.log("Opening: " + path);
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
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true }, (err) => {
      if (err) {
        return console.error(err);
      }
      shell.openPath(path);
      return;
    });
  } else {
    shell.openPath(path);
  }
}

// Read folders of the files.

function getFilesizeInBytes(filename) {
  var stats = fs.statSync(filename);
  var fileSizeInBytes = stats.size;
  return fileSizeInBytes;
}

function readDirectory(directory, append = false) {
  var filePaths = [];
  var folderPaths = [];
  var files = fs.readdirSync(directory);
  files.forEach((file) => {
    if (file.startsWith(".")) return;
    let filepath = path.join(directory, file);
    let stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      var subfolderPaths = {};
      if (append) {
        subfolderPaths = readDirectory(filepath, true);
      }
      folderPaths.push({ path: file, subfolders: subfolderPaths });
    } else {
      filePaths.push({ path: file, size: stats.size, abspath: filepath });
    }
  });
  return {
    files: filePaths,
    folders: folderPaths,
  };
}

function readDirectories(directory) {
  var folderPaths = [];
  var files = fs.readdirSync(directory);
  files.forEach((file) => {
    if (file.startsWith(".")) return;
    let filepath = path.join(directory, file);
    let stats = fs.statSync(filepath);
    if (stats.isDirectory(filepath)) {
      var subfolderPaths = {};
      subfolderPaths = readDirectories(filepath);
      folderPaths.push({ path: file, subfolders: subfolderPaths });
    }
  });
  return {
    folders: folderPaths,
  };
}

function sanitizePath(path) {
  path = path.replace(/:/g, "[colon]");
  path = path.replace(/\./g, "[dot]");
  path = path.replace(/\//g, "[slash]");
  path = path.replace(/\\/g, "[backslash]");
  path = path.replace(/</g, "[lt]");
  path = path.replace(/>/g, "[gt]");
  path = path.replace(/”/g, "[quote]");
  path = path.replace(/\|/g, "[pipe]");
  path = path.replace(/\?/g, "[question]");
  path = path.replace(/\*/g, "[asterisk]");
  path = path.replace(/\^/g, "[caret]");
  return path;
}
function deSanitizePath(path) {
  path = path.replace(/\[colon\]/g, ":");
  path = path.replace(/\[dot\]/g, ".");
  path = path.replace(/\[slash\]/g, "/");
  path = path.replace(/\[backslash\]/g, "\\");
  path = path.replace(/\[lt\]/g, "<");
  path = path.replace(/\[gt\]/g, ">");
  path = path.replace(/\[quote\]/g, "”");
  path = path.replace(/\[pipe\]/g, "|");
  path = path.replace(/\[question\]/g, "?");
  path = path.replace(/\[asterisk\]/g, "*");
  path = path.replace(/\[caret\]/g, "^");
  return path;
}

function addExtraFoldersToList(categories, categoryPath) {
  var rootPath;
  var rootLevel;
  var shouldUpdateTree = true;
  var filter = null;
  if (categories.length === 0) {
    if (!categoryPath) return;
    rootPath = path.dirname(userHomePath + categoryPath);
    rootLevel = categoryPath.split("/").length;
    shouldUpdateTree = false;
    filter = path.basename(userHomePath + categoryPath);
  } else {
    rootPath = userHomePath + categories[0].path;
    rootLevel = parseInt(categories[0].level);
  }
  var localPaths = [];
  function readDirs(root, index, level) {
    var files = fs.readdirSync(root);
    files.forEach((file) => {
      if (file.startsWith(".")) return;
      let fullpath = path.join(root, file);
      if (filter && fullpath.indexOf(filter) === -1) return;
      let stats = fs.statSync(fullpath);
      if (stats.isDirectory(fullpath)) {
        var categoryPath = fullpath.substring(userHomePath.length);
        var isExtra =
          categories.find((c) => c.path === categoryPath) === undefined;
        var _files = fs.readdirSync(fullpath);
        var hasFiles = _files.some((f) => !f.startsWith("."));
        if (isExtra && hasFiles) {
          localPaths.push({
            level: level + 1,
            path: categoryPath,
          });
        }
        readDirs(fullpath, index + 1, level + 1);
      }
    });
  }
  readDirs(rootPath, 0, rootLevel);
  if (localPaths.length === 0) return categories;
  localPaths.sort((a, b) => a.level - b.level);
  localPaths.forEach((lp) => {
    var level = lp.level;
    var parent = lp.path.split("/").slice(0, -1).join("/");
    var categoryIndex = categories.findIndex(
      (c) => parseInt(c.level) === level - 1 && c.path === parent
    );
    categories.splice(categoryIndex + 1, 0, {
      name: path.basename(lp.path),
      level: level,
      path: lp.path,
      isExtra: true,
    });
  });
  var newCategories = categories.map((c, i) => {
    c.index = String(i);
    c.id = c.id ? c.id : "fake-id-" + String(i) + "-" + Date.now();
    c.level = String(c.level);
    return c;
  });
  if (shouldUpdateTree) {
    mainWindow.webContents.send("extra-folders-found", newCategories);
  }
  return newCategories;
}

async function pullFolderList(categorypath, callback, args = null) {
  var url =
    getMediaDbUrl() + "/services/module/asset/entity/pullfolderlist.json";
  axios
    .post(
      url,
      {
        categorypath: categorypath,
      },
      {
        headers: connectionOptions.headers,
      }
    )
    .then(function (res) {
      if (res.data !== undefined) {
        var categories = res.data.categories;
        if (categories.length >= 0) {
          if (!fs.existsSync(userHomePath + categories[0].path)) {
            fs.mkdirSync(userHomePath + categories[0].path, {
              recursive: true,
            });
          }
          addExtraFoldersToList(categories, categorypath);
          if (args && args.length > 0) {
            callback(categories, ...args);
          } else {
            callback(categories);
          }
        }
      }
    })
    .catch(function (err) {
      console.log("Error loading: " + url);
      mainWindow.webContents.send("electron-error", err);
      console.log(err);
    });
}

ipcMain.on("downloadAll", (_, options) => {
  pullFolderList(options["categorypath"], downloadFolderRecursive, [
    0,
    options["scanOnly"],
  ]);
});

class DownloadCounter extends EventEmitter {
  constructor() {
    super();
    this.totalDownloads = 0;
    this.completedDownloads = 0;
  }

  setTotal(count) {
    this.totalDownloads = count;
    this.completedDownloads = 0;
    if (count === 0) {
      this.emit("completed");
    }
  }

  incrementCompleted() {
    this.completedDownloads++;
    if (this.completedDownloads >= this.totalDownloads) {
      this.emit("completed");
      this.completedDownloads = 0;
      this.totalDownloads = 0;
    }
  }
}

const downloadCounter = new DownloadCounter();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); // test

const downloadFolderRecursive = async function (
  categories,
  index = 0,
  scanOnly = false
) {
  if (index >= categories.length) {
    if (scanOnly) {
      mainWindow.webContents.send("scan-complete");
    } else {
      mainWindow.webContents.send("download-all-complete");
      downloadCounter.removeAllListeners("completed");
    }
    return;
  }

  const startNextDownload = async () => {
    if (categories.length > index) {
      index++;
      // await sleep(3000);
      await downloadFolderRecursive(categories, index, false);
      mainWindow.webContents.send("download-next", {
        index: index,
      });
    } else {
      mainWindow.webContents.send("download-all-complete");
      downloadCounter.removeAllListeners("completed");
    }
  };
  if (index === 0 && !scanOnly) {
    mainWindow.webContents.send("download-next", {
      index: index,
    });
    downloadCounter.on("completed", startNextDownload);
  }

  var category = categories[index];
  var fetchpath = userHomePath + category.path;
  var data = {};

  if (fs.existsSync(fetchpath)) {
    data = readDirectory(fetchpath, true);
  }

  data.categorypath = category.path;

  var downloadfolderurl =
    getMediaDbUrl() + "/services/module/asset/entity/pullpendingfiles.json";
  await axios
    .post(downloadfolderurl, data, {
      headers: connectionOptions.headers,
    })
    .then(function (res) {
      if (res.data !== undefined) {
        var filestodownload = res.data.filestodownload;
        var filestoupload = res.data.filestoupload;
        if (filestodownload !== undefined) {
          if (!scanOnly) {
            downloadCounter.setTotal(filestodownload.length);
          }
          if (!scanOnly) {
            filestodownload.forEach((item) => {
              var file = {
                itemexportname: category.path + "/" + item.path,
                itemdownloadurl: item.url,
                categorypath: category.path,
              };
              var assetid = item.id;
              console.log("Downloading: " + file.itemexportname);
              fetchfilesdownload(assetid, file, true);
            });
          } else {
            //?!: TODO: track extra files
            var folderDownloadSize = 0;
            filestodownload.forEach((item) => {
              folderDownloadSize += parseInt(item.size);
            });
            var folderUploadSize = 0;
            filestoupload.forEach((item) => {
              folderUploadSize += parseInt(item.size);
            });
            mainWindow.webContents.send("scan-progress", {
              ...category,
              downloadSize: folderDownloadSize,
              downloadCount: filestodownload.length,
              uploadSize: folderUploadSize,
              uploadCount: filestoupload.length,
            });
            index++;
            if (categories.length > index) {
              downloadFolderRecursive(categories, index, true);
            } else {
              mainWindow.webContents.send("scan-complete");
            }
          }
        } else {
          throw new Error("No files found");
        }
      } else {
        throw new Error("No data found");
      }
    })
    .catch(function (err) {
      downloadCounter.setTotal(0);
      console.log("Error on download Folder: " + category.path);
      mainWindow.webContents.send("electron-error", err);
    });
};

function getMediaDbUrl() {
  var mediadburl = store.get("mediadburl");
  if (!mediadburl) {
    const parsedUrl = URL.parse(store.get("homeUrl"), true);
    if (parsedUrl.protocol !== undefined && parsedUrl.host !== undefined) {
      mediadburl =
        parsedUrl.protocol +
        "//" +
        parsedUrl.host +
        "/" +
        connectionOptions.mediadb;
      console.log("mediadburl set to: " + mediadburl);
      store.set("mediadburl", mediadburl);
    }
  }
  return mediadburl;
}

/*
readirectory recursibly 
render indented list on Import screen
initiate with root path
have controls to lauch sync of the subfolders
have status of current, missing and already synced
Nice to haves:
Downlad all, Cancel, run on the background?
use orders as centarl manager?
*/

ipcMain.on("fetchFiles", (_, options) => {
  var fetchpath = userHomePath + options["categorypath"];
  var data = {};
  if (!fs.existsSync(fetchpath)) {
    fs.mkdirSync(fetchpath, { recursive: true });
  }
  data = readDirectory(fetchpath, true);
  data.filedownloadpath = fetchpath;
  mainWindow.webContents.send("files-fetched", {
    ...options,
    ...data,
  });
});

ipcMain.on("fetchFilesPush", (_, options) => {
  var fetchpath = userHomePath + options["categorypath"];
  var data = {};
  if (fs.existsSync(fetchpath)) {
    data = readDirectory(fetchpath, true);
  }
  data.filedownloadpath = fetchpath;
  console.log("fetchFiles push:");
  console.log(data);
  mainWindow.webContents.send("files-fetched-push", {
    ...options,
    ...data,
  });
});

ipcMain.on("fetchFoldersPush", (_, options) => {
  var fetchpath = userHomePath + options["categorypath"];
  var data = {};
  if (fs.existsSync(fetchpath)) {
    data = readDirectories(fetchpath);
  }
  data.filedownloadpath = fetchpath;
  //console.log(data);
  mainWindow.webContents.send("folders-fetched-push", {
    ...options,
    ...data,
  });
});

ipcMain.on("openFolder", (_, options) => {
  if (!options["path"].startsWith("/")) {
    options["path"] = userHomePath + options["path"];
  }
  openFolder(options["path"]);
});

ipcMain.on("folderSelected", (_, options) => {
  if (!options["currentPath"].startsWith(userHomePath)) {
    options["currentPath"] = userHomePath + options["path"];
  }

  // mainWindow.selectAPI.selectFolder().then((result) => {
  //   console.log(result);
  //   mainWindow.webContents.send("folder-selected", {
  //     previousPath: options["currentPath"],
  //     currentPath: result,
  //   });
  // });
});

class UploadManager {
  constructor(window_, maxConcurrentUploads = 4) {
    this.uploads = new Map();
    this.uploadQueue = [];
    this.maxConcurrentUploads = maxConcurrentUploads;
    this.currentUploads = 0;
    this.totalUploadsCount = 0;
    this.window = window_;
  }

  async uploadFile({
    uploadItemId,
    jsonData,
    filePath,
    onStarted,
    onCancel,
    onProgress,
    onCompleted,
    onError,
  }) {
    const formData = new FormData();

    formData.append("jsonrequest", JSON.stringify(jsonData));
    formData.append("file", fs.createReadStream(filePath));

    const uploadPromise = this.createUploadPromise(uploadItemId, formData, {
      onStarted,
      onProgress,
      onCancel,
      onCompleted,
      onError,
    });

    if (this.currentUploads < this.maxConcurrentUploads) {
      this.currentUploads++;
      uploadPromise.start();
    } else {
      this.uploadQueue.push(uploadPromise);
    }
    this.totalUploadsCount++;
  }

  createUploadPromise(uploadItemId, formData, callbacks) {
    return {
      start: async () => {
        try {
          if (typeof callbacks.onStarted === "function") {
            callbacks.onStarted();
          }

          const response = await axios.post(
            getMediaDbUrl() + "/services/module/asset/create",
            formData,
            {
              headers: connectionOptions.headers,
              onUploadProgress: (progressEvent) => {
                const progress = Math.round(
                  (progressEvent.loaded / progressEvent.total) * 100
                );
                if (typeof callbacks.onProgress === "function") {
                  callbacks.onProgress(progress);
                }
              },
            }
          );

          if (typeof callbacks.onCompleted === "function") {
            callbacks.onCompleted(response.data);
          }
        } catch (error) {
          if (axios.isCancel(error)) {
            if (typeof callbacks.onCancel === "function") {
              callbacks.onCancel();
            }
          } else {
            if (typeof callbacks.onError === "function") {
              callbacks.onError(error);
            }
          }
        } finally {
          console.log("Finally upload promise");
          this.currentUploads--;
          this.totalUploadsCount--;
          this.processQueue();
        }
      },
      cancel: () => {
        this.currentUploads--;
        this.uploads.delete(uploadItemId);
        if (typeof callbacks.onCancel === "function") {
          callbacks.onCancel();
        }
      },
    };
  }

  processQueue() {
    if (
      this.currentUploads < this.maxConcurrentUploads &&
      this.uploadQueue.length > 0
    ) {
      const nextUpload = this.uploadQueue.shift();
      this.currentUploads++;
      nextUpload.start();
    }
  }

  cancelUpload(uploadItemId) {
    const upload = this.uploads.get(uploadItemId);
    if (upload) {
      upload.cancel();
      this.uploads.delete(uploadItemId);
    }
  }
}

class UploadCounter extends EventEmitter {
  constructor() {
    super();
    this.totalUploads = 0;
    this.completedUploads = 0;
  }

  setTotal(count) {
    this.totalUploads = count;
    this.completedUploads = 0;
    if (count === 0) {
      this.emit("completed");
    }
  }

  incrementCompleted() {
    this.completedUploads++;
    if (this.completedUploads >= this.totalUploads) {
      this.emit("completed");
      this.completedUploads = 0;
      this.totalUploads = 0;
    }
  }
}

ipcMain.on("uploadAll", async (_, options) => {
  pullFolderList(options["categorypath"], uploadFilesRecursive);
});

var batchUploadManager = new UploadManager(mainWindow);
var uploadCounter = new UploadCounter();

function batchUpload(id, filePath, options) {
  batchUploadManager.uploadFile({
    uploadItemId: id,
    filePath: filePath,
    jsonData: options,
    onStarted: () => {},
    onCancel: () => {},
    onProgress: () => {},
    onCompleted: () => {
      uploadCounter.incrementCompleted();
    },
    onError: () => {
      uploadCounter.incrementCompleted();
    },
  });
}

async function uploadFilesRecursive(categories, index = 0) {
  if (index >= categories.length) {
    mainWindow.webContents.send("upload-all-complete");
    uploadCounter.removeAllListeners("completed");
    return;
  }

  const startNextUpload = async () => {
    if (categories.length > index) {
      index++;
      await uploadFilesRecursive(categories, index);
      mainWindow.webContents.send("upload-next", {
        index: index,
      });
    } else {
      mainWindow.webContents.send("upload-all-complete");
      uploadCounter.removeAllListeners("completed");
    }
  };

  if (index === 0) {
    mainWindow.webContents.send("upload-next", {
      index: index,
    });
    uploadCounter.on("completed", startNextUpload);
  }

  var category = categories[index];
  var fetchpath = userHomePath + category.path;

  var data = {};
  if (fs.existsSync(fetchpath)) {
    data = readDirectory(fetchpath, true);
  }
  data.categorypath = category.path;
  await axios
    .post(
      getMediaDbUrl() + "/services/module/asset/entity/pullpendingfiles.json",
      data,
      { headers: connectionOptions.headers }
    )
    .then(function (res) {
      if (res.data !== undefined) {
        var filestoupload = res.data.filestoupload;
        if (filestoupload !== undefined) {
          uploadCounter.setTotal(filestoupload.length);
          filestoupload.forEach((item, idx) => {
            var filepath = fetchpath + "/" + item.path;
            batchUpload(idx, filepath, {
              sourcepath: category.path + "/" + item.path,
            });
          });
        } else {
          throw new Error("No files found");
        }
      } else {
        throw new Error("No data found");
      }
    })
    .catch(function (err) {
      uploadCounter.setTotal(0);
      console.log("Error on uploadFilesRecursive: " + category.path);
      mainWindow.webContents.send("electron-error", err);
      console.log(err);
    });
}

ipcMain.on("trashExtraFiles", async (_, options) => {
  pullFolderList(options["categorypath"], trashFilesRecursive);
});

function trashFilesRecursive(categories, index = 0) {
  if (index >= categories.length) {
    mainWindow.webContents.send("trash-complete");
    return;
  }

  var category = categories[index];
  var fetchpath = userHomePath + category.path;
  var trashRoot = userHomePath + "_Trash/";
  var data = {};

  if (fs.existsSync(fetchpath)) {
    data = readDirectory(fetchpath, true);
  }

  data.categorypath = category.path;

  axios
    .post(
      getMediaDbUrl() + "/services/module/asset/entity/pullpendingfiles.json",
      data,
      {
        headers: connectionOptions.headers,
      }
    )
    .then(function (res) {
      if (res.data !== undefined) {
        var filestodelete = res.data.filestoupload;
        if (filestodelete) {
          filestodelete.forEach((item) => {
            if (!fs.existsSync(trashRoot + category.path)) {
              fs.mkdirSync(trashRoot + category.path, { recursive: true });
            }
            var filepath = category.path + "/" + item.path;
            if (fs.existsSync(trashRoot + filepath)) {
              filepath = category.path + "/" + Date.now() + "_" + item.path;
            }
            fs.renameSync(fetchpath + "/" + item.path, trashRoot + filepath);
          });
          trashFilesRecursive(categories, index + 1);
        } else {
          throw new Error("No files found");
        }
      } else {
        throw new Error("No data found");
      }
    })
    .catch(function (err) {
      trashFilesRecursive(categories, index + 1);
      console.log("Error on trashFilesRecursive: " + category.path);
      mainWindow.webContents.send("electron-error", err);
    });
}

ipcMain.on("pickFolder", (_, options) => {
  var fetchpath = pickFolder();
  var data = {};
  if (fs.existsSync(fetchpath)) {
    data = readDirectory(fetchpath);
  }
  data.filedownloadpath = fetchpath;
  mainWindow.webContents.send("files-fetched", {
    ...fetchpath,
    ...data,
  });
});

ipcMain.on("fetchfilesupload", async (event, { assetid, file }) => {
  var parsedUrl = URL.parse(store.get("homeUrl"), true);

  const items = {
    downloadItemId: assetid,
    downloadPath:
      parsedUrl.protocol + "//" + parsedUrl.host + file.itemdownloadurl,
    donwloadFilePath: file,
    localFolderPath: userHomePath + file.categorypath,
    header: connectionOptions.headers,
    onStarted: () => {
      //mainWindow.webContents.send(`download-started-${orderitemid}`);
    },
    onCancel: () => {
      //mainWindow.webContents.send(`download-abort-${orderitemid}`);
    },
    onResume: () => {
      //mainWindow.webContents.send(`download-resume-${orderitemid}`);
    },
    onPause: () => {
      //mainWindow.webContents.send(`download-pause-${orderitemid}`);
    },
    onProgress: (progress, bytesLoaded, filePath) => {
      /*  mainWindow.webContents.send(`download-progress-${orderitemid}`, {
        loaded: bytesLoaded,
        total: progress.total,
      });*/
    },
    onCompleted: (filePath, totalBytes) => {
      // mainWindow.webContents.send(`download-finished-${orderitemid}`, filePath);
      mainWindow.webContents.send("refresh-sync", {
        categorypath: file.categorypath,
      });
    },
    onError: (err) => {
      //mainWindow.webContents.send(`download-error-${orderitemid}`, err);
      console.log(err);
    },
  };
  downloadManager.downloadFile(items);
});

ipcMain.on("fetchfilesdownload", async (_, { assetid, file }) => {
  fetchfilesdownload(assetid, file);
});

function fetchfilesdownload(assetid, file, batchMode = false) {
  var parsedUrl = URL.parse(store.get("homeUrl"), true);

  const items = {
    downloadItemId: assetid,
    downloadPath:
      parsedUrl.protocol + "//" + parsedUrl.host + file.itemdownloadurl,
    donwloadFilePath: file,
    localFolderPath: userHomePath + file.categorypath,
    header: connectionOptions.headers,
    onStarted: () => {
      //mainWindow.webContents.send(`download-started-${orderitemid}`);
    },
    onCancel: () => {
      //mainWindow.webContents.send(`download-abort-${orderitemid}`);
    },
    onResume: () => {
      //mainWindow.webContents.send(`download-resume-${orderitemid}`);
    },
    onPause: () => {
      //mainWindow.webContents.send(`download-pause-${orderitemid}`);
    },
    onProgress: (progress, bytesLoaded, filePath) => {
      /*  mainWindow.webContents.send(`download-progress-${orderitemid}`, {
        loaded: bytesLoaded,
        total: progress.total,
      });*/
    },
    onCompleted: (filePath, totalBytes) => {
      // mainWindow.webContents.send(`download-finished-${orderitemid}`, filePath);

      mainWindow.webContents.send("download-asset-complete", {
        categorypath: file.categorypath,
        assetid: file.assetid,
      });

      // console.log("Downloaded: " + filePath);
      if (batchMode) {
        downloadCounter.incrementCompleted();
      }
    },
    onError: (err) => {
      //mainWindow.webContents.send(`download-error-${orderitemid}`, err);
      console.log(err);
    },
  };
  downloadManager.downloadFile(items);
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
    localFolderPath,
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
        mainWindow.webContents.send("electron-error", err);
        return;
      }
    }

    var fileDownloadedPath = "";

    if (localFolderPath != null) {
      fileDownloadedPath = localFolderPath;
    } else {
      fileDownloadedPath =
        store.get("downloadDefaultPath") ?? app.getPath("downloads");
    }

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
    // console.log(
    //   this.currentDownloads +
    //     " current downloads of " +
    //     this.downloadQueue.length
    // );
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
              100
          );
          this.emit("progress", progressEvent);
          if (typeof this.onProgressCallback === "function") {
            this.onProgressCallback(
              progressEvent,
              this.downloadData.bytesDownloaded + progressEvent.loaded,
              this.filePath
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

/**
 * // Function to initiate a download from the renderer process
 *   function initiateDownload(orderitemid, file, headers) {
 *     // Send an IPC event to the main process with download details
 *     mainWindow.webContents.send('start-download', {
 *       orderitemid,
 *       file,
 *       headers,
 *     });
 *   }
 *
 *   // Function to handle download progress updates received from the main process
 *   function handleDownloadProgress(event, { orderitemid, loaded, total }) {
 *     // Update the UI element representing download progress for the specific orderitemid (e.g., progress bar)
 *     console.log(`Download ${orderitemid} progress: ${loaded}/${total}`);
 *     // Replace with your specific UI framework logic to update the progress bar
 *     // document.getElementById(`download-progress-${orderitemid}`).value = loaded / total;
 *   }
 *
 *   // Function to handle download completion received from the main process
 *   function handleDownloadCompleted(event, filePath) {
 *     console.log(`Download completed: ${filePath}`);
 *     // Handle successful download completion (e.g., display success message)
 *     // You might update UI or perform actions based on the downloaded file
 *   }
 *
 *   // Function to handle download cancellation/abortion received from the main process
 *   function handleDownloadCancelled(event, orderitemid) {
 *     console.log(`Download ${orderitemid} cancelled/aborted`);
 *     // Handle download cancellation (e.g., display cancellation message)
 *     // You might reset UI elements related to the cancelled download
 *   }
 *
 *   // Function to handle download errors received from the main process
 *   function handleDownloadError(event, error) {
 *     console.error('Download error:', error);
 *     // Handle download errors (e.g., display error message to the user)
 *   }
 *
 *   // Function to handle download pause received from the main process
 *   function handleDownloadPaused(event, orderitemid) {
 *     console.log(`Download ${orderitemid} paused`);
 *     // Handle download pausing (e.g., update UI to indicate pause)
 *   }
 *
 *   // Function to handle download resume received from the main process
 *   function handleDownloadResumed(event, orderitemid) {
 *     console.log(`Download ${orderitemid} resumed`);
 *     // Handle download resuming (e.g., update UI to indicate resume)
 *   }
 *
 *   // Register listeners for IPC events from the main process
 *   ipcRenderer.on('download-started-${orderitemid}', () => {
 *     console.log(`Download ${orderitemid} started`);
 *     // You might update UI to indicate download has started (e.g., show a loading indicator)
 *   });
 *
 *   ipcRenderer.on('download-progress-${orderitemid}', handleDownloadProgress);
 *   ipcRenderer.on('download-finished-${orderitemid}', handleDownloadCompleted);
 *   ipcRenderer.on('download-abort-${orderitemid}', handleDownloadCancelled);
 *   ipcRenderer.on('download-error-${orderitemid}', handleDownloadError);
 *   ipcRenderer.on('download-pause-${orderitemid}', handleDownloadPaused);
 *   ipcRenderer.on('download-resume-${orderitemid}', handleDownloadResumed);
 *
 *   // Example usage: initiate a download with order ID, file information, and headers
 *   const fileInfo = { itemdownloadurl: '/path/to/file.zip' };
 *   const headers = { 'Authorization': 'Bearer your_auth_token' };
 *   initiateDownload('download-123', fileInfo, headers);
 *
 *   // Example usage: pause/resume/cancel download by ID (replace with button clicks or user actions)
 *   function pauseDownload(orderitemid) {
 *     mainWindow.webContents.send('pause-download', { orderitemid });
 *   }
 *
 *   function resumeDownload(orderitemid) {
 *     mainWindow.webContents.send('resume-download', { orderitemid });
 *   }
 *
 *   function cancelDownload(orderitemid) {
 *     mainWindow.webContents.send('cancel-download', { orderitemid });
 *   }
 *
 */

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
  var parsedUrl = URL.parse(store.get("homeUrl"), true);
  const items = {
    downloadItemId: orderitemid,
    downloadPath:
      parsedUrl.protocol + "//" + parsedUrl.host + file.itemdownloadurl,
    donwloadFilePath: file,
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
      console.log("Download Complete: " + filePath);
    },
    onError: (err) => {
      mainWindow.webContents.send(`download-error-${orderitemid}`, err);
    },
  };
  downloadManager.downloadFile(items);
});

// -------- Upload -------
const uploadManager = new UploadManager(mainWindow);

// Listen for the "start-upload" event from the renderer process
ipcMain.on("start-upload", async (event, options) => {
  try {
    // Initiate the upload process using the upload manager
    const uploadItemId = options["itemid"];
    const item = {
      uploadItemId: uploadItemId,
      jsonData: options,
      filePath: options["abspath"],
      onStarted: () => {
        // Send an event to the renderer process indicating upload started
        mainWindow.webContents.send(`upload-started-${uploadItemId}`);
      },
      onCancel: () => {
        // Send an event to the renderer process indicating upload cancelled
        mainWindow.webContents.send(`upload-cancelled-${uploadItemId}`);
      },
      onProgress: (progress) => {
        // Send an event to the renderer process with upload progress information
        mainWindow.webContents.send(`upload-progress-${uploadItemId}`, {
          progress,
        });
      },
      onCompleted: (data) => {
        // Send an event to the renderer process with upload completion data
        mainWindow.webContents.send(`upload-completed-${uploadItemId}`, data);
      },
      onError: (err) => {
        // Send an event to the renderer process with upload error information
        mainWindow.webContents.send(`upload-error-${uploadItemId}`, err);
      },
    };
    await uploadManager.uploadFile(item);
  } catch (err) {
    console.error("Error during upload:", err);
    mainWindow.webContents.send("electron-error", err);
  }
});

// Listen for the "cancel-upload" event from the renderer process
ipcMain.on("cancel-upload", (event, { uploadItemId }) => {
  // Attempt to cancel the upload using the upload manager
  uploadManager.cancelUpload(uploadItemId);
});
/**
 *  ipcRenderer.send('onOpenFile', {path});
 */

ipcMain.on("onOpenFile", (event, path) => {
  let downloadpath = app.getPath("downloads");
  openFile(downloadpath + "/" + path.itemexportname);
});

/**
 * // Send an IPC message to the main process requesting to read a directory
 *
 * const sendReadDirRequest = (path) => {
 *   ipcRenderer.send('readDir', { path, onScan: (fileList) => {
 *     console.log('Received files from main process:', fileList.files);
 *     console.log('Received folder from main process:', fileList.folders);
 *     // Handle the directory listing data here (e.g., display in a UI element)
 *   }});
 * };
 *
 * // Example usage (assuming you have a button to trigger the read directory)
 *
 * const readDirButton = document.getElementById('read-dir-button');
 * readDirButton.addEventListener('click', () => {
 *   const directoryPath = '/path/to/your/directory';
 *   sendReadDirRequest(directoryPath);
 * });
 *
 */

ipcMain.on("readDir", (event, { path }) => {
  const files = readDirectory(path); // Call the function to read the directory

  //onScan(files)
  console.log("Received files from main process:", files);
});

ipcMain.on("readDirX", (event, { path, onScan }) => {
  const files = readDirectory(path); // Call the function to read the directory
  onScan(files);
});

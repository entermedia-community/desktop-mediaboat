process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  Tray,
  shell,
} = require("electron");
const path = require("path");
const log = require("electron-log");
const FormData = require("form-data");
const Store = require("electron-store");
const URL = require("url");
const fs = require("fs");
const { EventEmitter } = require("events");
const axios = require("axios");
const extName = require("ext-name");
const fileWatcher = require("chokidar");

let defaultWorkDirectory = app.getPath("home") + "/eMedia/";

let connectionOptions = {};

const isDev = process.env.NODE_ENV === "development";

if (isDev) {
  try {
    require("electron-reloader")(module, {
      ignore: ["dist", "build", "node_modules"],
    });
  } catch (err) {
    mainWindow.webContents.send("electron-error", err);
  }
}

let mainWindow;
let entermediaKey;

//Config
const appLogo = "/assets/images/icon.png";
const trayLogo = "/assets/images/em.png";

const store = new Store();
const welcomeForm = `file://${__dirname}/config.html`;

const currentVersion = process.env.npm_package_version;

//Handle logs with electron-logs
log.initialize();
let console = {};
console.log = function (...args) {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.webContents) {
    mainWindow.webContents.send("electron-log", args);
  }
  log.log.apply(this, args);
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

function triggerHotScan(p, workDir) {
  let subfolder = p.replace(workDir, "");
  let depth = subfolder.split("/").length;
  if (depth >= 2) {
    scanHotFolders(workDir);
  }
}

let watcher;
async function StartWatcher(workPath) {
  if (watcher) {
    await watcher.close();
  }
  if (!fs.existsSync(workPath)) {
    return;
  }
  watcher = fileWatcher.watch(workPath, {
    ignored: /[\/\\]\./,
    persistent: true,
    ignoreInitial: true,
    followSymlinks: false,
  });

  watcher
    .on("add", (p) => triggerHotScan(p, workPath))
    .on("addDir", (p) => triggerHotScan(p, workPath))
    .on("unlink", (p) => triggerHotScan(p, workPath))
    .on("unlinkDir", (p) => triggerHotScan(p, workPath))
    .on("error", (error) => {
      console.log("Chokidar error:", error);
    })
    .on("ready", () => {
      console.log("Watching for changes on", workPath);
    });
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

  const homeUrl = store.get("homeUrl");
  const localDrive = store.get("localDrive");
  app.allowRendererProcessReuse = false;
  if (!homeUrl || !localDrive) {
    openWorkspacePicker(welcomeForm);
  } else {
    defaultWorkDirectory = localDrive;
    openWorkspace(homeUrl);
  }
  // Open the DevTools.
  // if (isDev) {
  //   mainWindow.webContents.openDevTools();
  // }

  // Main Menu
  setMainMenu(mainWindow);

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

  const workDir = store.get("workDir");
  if (workDir) {
    StartWatcher(workDir);
  }
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

function openWorkspacePicker(pickerURL) {
  mainWindow.loadURL(pickerURL);
}

ipcMain.on("configInit", () => {
  const welcomeDone = store.get("welcomeDone");
  const workspaces = store.get("workspaces");
  mainWindow.webContents.send("config-init", {
    welcomeDone: welcomeDone,
    workspaces,
    defaultLocalDrive: defaultWorkDirectory,
  });
});

ipcMain.on("welcomeDone", () => {
  store.set("welcomeDone", true);
});

ipcMain.on("addWorkspace", (_, newWorkspace) => {
  let workspaces = store.get("workspaces") || [];
  workspaces = workspaces.filter((w) => w.url);
  const editMode = workspaces.find((w) => w.url === newWorkspace.url);
  if (!editMode) {
    workspaces.push(newWorkspace);
  } else {
    workspaces = workspaces.map((w) => {
      if (w.url === newWorkspace.url) {
        return newWorkspace;
      }
      return w;
    });
  }
  store.set("workspaces", workspaces);
  if (newWorkspace.url === store.get("homeUrl")) {
    defaultWorkDirectory = newWorkspace.drive;
  }
  mainWindow.webContents.send("workspaces-updated", workspaces);
});

ipcMain.on("deleteWorkspace", (_, url) => {
  let workspaces = store.get("workspaces") || [];
  workspaces = workspaces.filter((w) => w.url !== url);
  store.set("workspaces", workspaces);
  const homeUrl = store.get("homeUrl");
  if (homeUrl === url) {
    store.delete("homeUrl");
  }
});

function openWorkspace(homeUrl) {
  mainWindow.loadURL(homeUrl);
}

ipcMain.on("setConnectionOptions", (_, options) => {
  connectionOptions = options;
  store.set("mediadburl", options.mediadb);
  mainWindow.webContents.send("desktopReady");
});

ipcMain.on("getWorkDir", () => {
  const workDir = store.get("workDir");
  const workDirEntity = store.get("workDirEntity");
  mainWindow.webContents.send("set-workDir", {
    workDir: workDir,
    workDirEntity: workDirEntity,
  });
});

ipcMain.on("setWorkDirEntity", (_, { entityId }) => {
  store.set("workDirEntity", entityId);
  const rootPath = store.get("workDir");
  scanHotFolders(rootPath, entityId);
});

function getDirectoryStats(dirPath) {
  let totalFiles = 0;
  let totalFolders = -1;
  let totalSize = 0;

  function traverseDirectory(currentPath) {
    const items = fs.readdirSync(currentPath);
    totalFolders++;
    items.forEach((item) => {
      if (item.startsWith(".")) return;
      const fullPath = path.join(currentPath, item);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        traverseDirectory(fullPath);
      } else if (stats.isFile()) {
        totalFiles++;
        totalSize += stats.size;
      }
    });
  }
  traverseDirectory(dirPath);
  return {
    totalFiles,
    totalFolders,
    totalSize,
  };
}

function scanDirectoryWithStats(directory, maxLevel = 1) {
  if (maxLevel <= 0) return {};
  let files = fs.readdirSync(directory);
  let folders = {};
  files.forEach((file) => {
    if (file.startsWith(".")) return;
    let filepath = path.join(directory, file);
    let stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      let { totalFiles, totalFolders, totalSize } = getDirectoryStats(filepath);
      folders[file] = {};
      folders[file]["totalSize"] = totalSize;
      folders[file]["totalFiles"] = totalFiles;
      folders[file]["totalFolders"] = totalFolders;
      if (maxLevel > 1) {
        folders[file]["subfolders"] = scanDirectoryWithStats(
          filepath,
          maxLevel - 1
        );
      }
    }
  });
  return folders;
}

ipcMain.on("select-dirs", async (_, arg) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    defaultPath: arg.currentPath,
  });
  let rootPath = result.filePaths[0];
  store.set("workDir", rootPath);
  store.delete("workDirEntity");
  mainWindow.webContents.send("no-workDirEntity");
  StartWatcher(rootPath);
});

ipcMain.on("configDir", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    defaultPath: defaultWorkDirectory,
  });
  let rootPath = result.filePaths[0];
  mainWindow.webContents.send("config-dir", rootPath);
});

ipcMain.on("openWorkspace", (_, { url, drive }) => {
  if (drive === "demo") {
    drive = app.getPath("home") + "/eMedia/";
  }
  if (!drive.endsWith("/")) {
    drive += "/";
  }
  defaultWorkDirectory = drive;
  store.set("localDrive", drive);
  store.set("homeUrl", url);
  openWorkspace(url);
});

ipcMain.on("openExternal", (_, url) => {
  shell.openExternal(url);
});

function scanHotFolders(rootPath, workDirEntity = null) {
  if (!rootPath) {
    mainWindow.webContents.send("no-workDir");
    return;
  }
  if (!workDirEntity) {
    workDirEntity = store.get("workDirEntity");
    if (!workDirEntity) {
      mainWindow.webContents.send("no-workDirEntity");
      return;
    }
  }
  const folderTree = scanDirectoryWithStats(rootPath);
  const folderNames = Object.keys(folderTree);

  const data = {
    moduleid: workDirEntity,
    name: folderNames,
  };

  const url =
    getMediaDbUrl() + "/services/module/asset/entity/bulk/scanfornew.json";

  axios
    .post(url, data, {
      headers: {
        ...connectionOptions.headers,
      },
    })
    .then(function (res) {
      const existingFolders = res.data.existingfolders;
      folderNames.forEach((folder) => {
        const f = existingFolders.find((e) => e.name === folder);
        if (f) {
          folderTree[folder].id = f.id;
        }
      });
      mainWindow.webContents.send("selected-dirs", {
        rootPath: rootPath,
        folderTree: folderTree,
        workDirEntity: workDirEntity,
        newFolders: res.data.newfolders,
        existingFolders: existingFolders,
      });
    })
    .catch(function (err) {
      console.log(err);
    });
}

ipcMain.on("scanHotFolders", (_, rootPath) => {
  scanHotFolders(rootPath);
});

ipcMain.on(
  "importHotFolders",
  (_, { rootPath, workDirEntity, selectedFolders, requiredFields }) => {
    if (!rootPath || !workDirEntity) {
      console.log("No rootPath or workDirEntity");
      return;
    }

    const formData = new FormData();
    formData.append("moduleid", workDirEntity);
    selectedFolders.forEach((folder) => {
      formData.append("name", folder);
    });
    requiredFields.forEach((field) => {
      formData.append(field.name, field.value || "");
    });

    const url =
      getMediaDbUrl() +
      "/services/module/asset/entity/bulk/createentities.json";

    const tempWorkDirectory = path.resolve(rootPath, "..");

    axios
      .post(url, formData, {
        headers: {
          "Content-Type": `multipart/form-data`,
          ...connectionOptions.headers,
        },
      })
      .then(function (res) {
        let existingFolders = res.data.existingfolders;
        if (existingFolders.length === 0) {
          return;
        }
        mainWindow.webContents.send(
          "created-hot-folders",
          existingFolders.map((f) => ({ name: f.name, id: f.id }))
        );

        existingFolders.forEach((folder) => {
          fetchSubFolderContent(
            tempWorkDirectory,
            folder.path,
            uploadFilesRecursive,
            [0, { type: "hotFolder", name: folder.name, entityId: folder.id }],
            true
          );
        });
      })
      .catch(function (err) {
        log.error(err);
      });
  }
);

function setMainMenu(mainWindow) {
  const template = [
    {
      label: "Workspace",
      submenu: [
        {
          label: "Preferences",
          accelerator: "CmdOrCtrl+,",
          click() {
            openWorkspacePicker(welcomeForm);
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
      label: "Browser",
      submenu: [
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
          label: "Inspect Element",
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
  let contextMenu = Menu.buildFromTemplate(this.trayMenu);
  this.tray.setContextMenu(contextMenu);
}

ipcMain.on("uploadFolder", (event, options) => {
  console.log("uploadFolder called", options);

  //uploadFolder(options);
  let inSourcepath = options["sourcepath"];
  let inMediadbUrl = options["mediadburl"];
  entermediaKey = options["entermediakey"];

  dialog
    .showOpenDialog(mainWindow, {
      properties: ["openFile", "openDirectory"],
    })
    .then((result) => {
      //console.log(result.canceled)
      //console.log(result.filePaths)
      let directory = result.filePaths[0];
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
  //let directoryfinal = directory.replace(defaultWorkDirectory, ''); //remove user home
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
  //entermediaKey = "cristobalmd542602d7e0ba09a4e08c0a6234578650c08d0ba08d";
  console.log("submitForm Sending Form: " + formurl);

  fetch(formurl, {
    method: "POST",
    body: form,
    useSessionCookie: true,
    headers: { "X-tokentype": "entermedia", "X-token": entermediaKey },
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
        let filenamefinal = filepath.replace(defaultWorkDirectory, ""); //remove user home
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
      let filenamefinal = filepath.replace(defaultWorkDirectory, ""); //remove user home
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
  entermediaKey = options["entermediakey"];
  downloadpaths = options["downloadpaths"];
  console.log("Download paths ", downloadpaths);
  downloadpaths.forEach(function (downloadpath) {
    downloadfile("https://em11.entermediadb.org" + downloadpath.url);
  });
});

// ---------------------- Open file ---------------------

function openFile(path) {
  console.log("Opening: " + path);
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
  let stats = fs.statSync(filename);
  let fileSizeInBytes = stats.size;
  return fileSizeInBytes;
}

function readDirectory(directory, append = false) {
  let filePaths = [];
  let folderPaths = [];
  let files = fs.readdirSync(directory);
  files.forEach((file) => {
    if (file.startsWith(".")) return;
    let filepath = path.join(directory, file);
    let stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      let subfolderPaths = {};
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
  let folderPaths = [];
  let files = fs.readdirSync(directory);
  files.forEach((file) => {
    if (file.startsWith(".")) return;
    let filepath = path.join(directory, file);
    let stats = fs.statSync(filepath);
    if (stats.isDirectory(filepath)) {
      let subfolderPaths = {};
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
  let rootPath;
  let rootLevel;
  let shouldUpdateTree = true;
  let filter = null;
  if (categories.length === 0) {
    if (!categoryPath) return;
    rootPath = path.dirname(defaultWorkDirectory + categoryPath);
    rootLevel = categoryPath.split("/").length;
    shouldUpdateTree = false;
    filter = path.basename(defaultWorkDirectory + categoryPath);
  } else {
    rootPath = defaultWorkDirectory + categories[0].path;
    rootLevel = parseInt(categories[0].level);
  }
  let localPaths = [];
  function readDirs(root, index, level) {
    let files = fs.readdirSync(root);
    files.forEach((file) => {
      if (file.startsWith(".")) return;
      let fullpath = path.join(root, file);
      if (filter && fullpath.indexOf(filter) === -1) return;
      let stats = fs.statSync(fullpath);
      if (stats.isDirectory(fullpath)) {
        let categoryPath = fullpath.substring(defaultWorkDirectory.length);
        let isExtra =
          categories.find((c) => c.path === categoryPath) === undefined;
        let _files = fs.readdirSync(fullpath);
        let hasFiles = _files.some((f) => !f.startsWith("."));
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
    let level = lp.level;
    let parent = lp.path.split("/").slice(0, -1).join("/");
    let categoryIndex = categories.findIndex(
      (c) => parseInt(c.level) === level - 1 && c.path === parent
    );
    categories.splice(categoryIndex + 1, 0, {
      name: path.basename(lp.path),
      level: level,
      path: lp.path,
      isExtra: true,
    });
  });
  let newCategories = categories.map((c, i) => {
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

async function fetchSubFolderContent(
  rootPath,
  categorypath,
  callback,
  args = null,
  ignoreExtra = false
) {
  const url =
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
        const categories = res.data.categories;
        if (categories && categories.length >= 0) {
          if (
            categories.length > 0 &&
            !fs.existsSync(rootPath + categories[0].path)
          ) {
            fs.mkdirSync(rootPath + categories[0].path, {
              recursive: true,
            });
          }
          if (!ignoreExtra) {
            addExtraFoldersToList(categories, categorypath);
          }
          if (args && args.length > 0) {
            callback(categories, ...args);
          } else {
            callback(categories);
          }
        } else {
          console.log({ categories });
        }
      }
    })
    .catch(function (err) {
      console.log("Error loading: " + url);
      mainWindow.webContents.send("electron-error", err);
      console.log(err);
    });
}

ipcMain.on("downloadAll", (_, { categorypath, scanOnly = false }) => {
  fetchSubFolderContent(
    defaultWorkDirectory,
    categorypath,
    downloadFolderRecursive,
    [0, scanOnly]
  );
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

  let category = categories[index];
  let fetchpath = defaultWorkDirectory + category.path;
  let data = {};

  if (fs.existsSync(fetchpath)) {
    data = readDirectory(fetchpath, true);
  }

  data.categorypath = category.path;

  let downloadfolderurl =
    getMediaDbUrl() + "/services/module/asset/entity/pullpendingfiles.json";
  await axios
    .post(downloadfolderurl, data, {
      headers: connectionOptions.headers,
    })
    .then(function (res) {
      if (res.data !== undefined) {
        let filestodownload = res.data.filestodownload;
        let filestoupload = res.data.filestoupload;
        if (filestodownload !== undefined) {
          if (!scanOnly) {
            downloadCounter.setTotal(filestodownload.length);
          }
          if (!scanOnly) {
            filestodownload.forEach((item) => {
              let file = {
                itemexportname: category.path + "/" + item.path,
                itemdownloadurl: item.url,
                categorypath: category.path,
              };
              let assetid = item.id;
              console.log("Downloading: " + file.itemexportname);
              fetchfilesdownload(assetid, file, true);
            });
          } else {
            let folderDownloadSize = 0;
            filestodownload.forEach((item) => {
              folderDownloadSize += parseInt(item.size);
            });
            let folderUploadSize = 0;
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
  const mediadburl = store.get("mediadburl");
  if (!mediadburl) {
    console.log("No MediaDB URL found");
    mainWindow.webContents.send("electron-error", "No MediaDB URL found");
  }
  return mediadburl;
}

ipcMain.on("fetchFiles", (_, options) => {
  let fetchpath = defaultWorkDirectory + options["categorypath"];
  let data = {};
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
  let fetchpath = defaultWorkDirectory + options["categorypath"];
  let data = {};
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
  let fetchpath = defaultWorkDirectory + options["categorypath"];
  let data = {};
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
    options["path"] = defaultWorkDirectory + options["path"];
  }
  openFolder(options["path"]);
});

ipcMain.on("folderSelected", (_, options) => {
  if (!options["currentPath"].startsWith(defaultWorkDirectory)) {
    options["currentPath"] = defaultWorkDirectory + options["path"];
  }
});

const abortController = new AbortController();
class UploadManager {
  constructor(window_, maxConcurrentUploads = 4) {
    this.progress = new Map();
    this.uploadQueue = [];
    this.maxConcurrentUploads = maxConcurrentUploads;
    this.currentUploads = 0;
    this.totalUploadsCount = 0;
    this.window = window_;
  }

  async uploadFile({
    uploadEntityId,
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

    const uploadPromise = this.createUploadPromise(uploadEntityId, formData, {
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

  createUploadPromise(uploadEntityId, formData, callbacks) {
    return {
      start: async () => {
        try {
          if (typeof callbacks.onStarted === "function") {
            callbacks.onStarted(uploadEntityId);
          }

          let progress = this.progress.get(uploadEntityId);
          if (!progress) {
            progress = {
              loaded: 0,
              total: 0,
            };
            this.progress.set(uploadEntityId, progress);
          }

          const response = await axios.post(
            getMediaDbUrl() + "/services/module/asset/create",
            formData,
            {
              signal: abortController.signal,
              headers: connectionOptions.headers,
              onUploadProgress: (progressEvent) => {
                if (!progressEvent.lengthComputable) {
                  return;
                }
                progress.total += progressEvent.total;
                progress.loaded += progressEvent.loaded;
                this.progress.set(uploadEntityId, progress);
                if (typeof callbacks.onProgress === "function") {
                  callbacks.onProgress({
                    id: uploadEntityId,
                    loaded: progress.loaded,
                    total: progress.total,
                  });
                }
              },
            }
          );

          if (typeof callbacks.onCompleted === "function") {
            callbacks.onCompleted(uploadEntityId);
          }
        } catch (error) {
          if (axios.isCancel(error)) {
            if (typeof callbacks.onCancel === "function") {
              callbacks.onCancel();
            }
          } else {
            if (typeof callbacks.onError === "function") {
              callbacks.onError(uploadEntityId, error);
            }
          }
        } finally {
          this.currentUploads--;
          this.totalUploadsCount--;
          this.processQueue();
        }
      },
      cancel: () => {
        abortController.abort();
        this.currentUploads = 0;
        this.uploadQueue = [];
        this.totalUploadsCount = 0;
        this.progress.clear();
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
    } else if (this.uploadQueue.length === 0 && this.currentUploads === 0) {
      this.progress.clear();
      mainWindow.webContents.send("upload-all-complete");
    }
  }

  cancelUpload() {
    abortController.abort();
    this.currentUploads = 0;
    this.uploadQueue = [];
    this.totalUploadsCount = 0;
    this.progress.clear();
    mainWindow.webContents.send("upload-all-complete");
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

ipcMain.on("uploadAll", async (_, { categorypath, entityId }) => {
  fetchSubFolderContent(
    defaultWorkDirectory,
    categorypath,
    uploadFilesRecursive,
    [0, { entityId: entityId }]
  );
});

const batchUploadManager = new UploadManager(mainWindow);
const uploadCounter = new UploadCounter();

ipcMain.on("abortUpload", () => {
  batchUploadManager.cancelUpload();
});

const defaultUploadEvents = {
  onStarted: (id) => {
    mainWindow.webContents.send("upload-start", id);
  },
  onCancel: () => {
    mainWindow.webContents.send("upload-all-complete");
  },
  onProgress: ({ id, loaded, total }) => {
    const progress = Math.round((loaded / total) * 100);
    mainWindow.webContents.send("upload-progress", {
      id,
      progress,
      loaded,
      total,
    });
  },
  onCompleted: (id) => {
    uploadCounter.incrementCompleted();
    mainWindow.webContents.send("upload-single-complete", id);
  },
  onError: (id, err) => {
    uploadCounter.incrementCompleted();
    mainWindow.webContents.send("upload-error", { id, error: err });
  },
};

async function uploadFilesRecursive(categories, index = 0, options = {}) {
  if (index >= categories.length) {
    uploadCounter.removeAllListeners("completed");
    mainWindow.webContents.send("upload-all-complete");
    return;
  }

  const startNextUpload = async () => {
    if (categories.length > index) {
      await uploadFilesRecursive(categories, index + 1, options);
    } else {
      uploadCounter.removeAllListeners("completed");
      mainWindow.webContents.send("upload-all-complete");
    }
  };

  if (index === 0) {
    uploadCounter.on("completed", startNextUpload);
  }

  let category = categories[index];
  let fetchpath = defaultWorkDirectory + category.path;

  let data = {};
  if (fs.existsSync(fetchpath)) {
    data = readDirectory(fetchpath, true);
  }
  data.categorypath = category.path;
  data.entityid = options["entityId"];
  await axios
    .post(
      getMediaDbUrl() + "/services/module/asset/entity/pullpendingfiles.json",
      data,
      { headers: connectionOptions.headers }
    )
    .then(function (res) {
      if (res.data !== undefined) {
        let filestoupload = res.data.filestoupload;
        console.log({ filestoupload });
        if (filestoupload !== undefined) {
          uploadCounter.setTotal(filestoupload.length);
          if (filestoupload.length === 0) {
            mainWindow.webContents.send(
              "upload-single-complete",
              options["entityId"]
            );
            return;
          }
          filestoupload.forEach((item) => {
            let filepath = fetchpath + "/" + item.path;
            batchUploadManager.uploadFile({
              uploadEntityId: options["entityId"],
              filePath: filepath,
              jsonData: {
                sourcepath: category.path + "/" + item.path,
              },
              ...defaultUploadEvents,
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

ipcMain.on("trashExtraFiles", async (_, { categorypath }) => {
  fetchSubFolderContent(
    defaultWorkDirectory,
    categorypath,
    trashFilesRecursive
  );
});

function trashFilesRecursive(categories, index = 0) {
  if (index >= categories.length) {
    mainWindow.webContents.send("trash-complete");
    return;
  }

  let category = categories[index];
  let fetchpath = defaultWorkDirectory + category.path;
  let trashRoot = defaultWorkDirectory + "_Trash/";
  let data = {};

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
        let filestodelete = res.data.filestoupload;
        if (filestodelete) {
          filestodelete.forEach((item) => {
            if (!fs.existsSync(trashRoot + category.path)) {
              fs.mkdirSync(trashRoot + category.path, { recursive: true });
            }
            let filepath = category.path + "/" + item.path;
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
  let fetchpath = pickFolder();
  let data = {};
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
  const parsedUrl = URL.parse(store.get("homeUrl"), true);

  const items = {
    downloadItemId: assetid,
    downloadPath:
      parsedUrl.protocol + "//" + parsedUrl.host + file.itemdownloadurl,
    donwloadFilePath: file,
    localFolderPath: defaultWorkDirectory + file.categorypath,
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
  const parsedUrl = URL.parse(store.get("homeUrl"), true);

  const items = {
    downloadItemId: assetid,
    downloadPath:
      parsedUrl.protocol + "//" + parsedUrl.host + file.itemdownloadurl,
    donwloadFilePath: file,
    localFolderPath: defaultWorkDirectory + file.categorypath,
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
        let directory = result[0];
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

    let fileDownloadedPath = "";

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
  const parsedUrl = URL.parse(store.get("homeUrl"), true);
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

ipcMain.on("onOpenFile", (event, path) => {
  let downloadpath = app.getPath("downloads");
  openFile(downloadpath + "/" + path.itemexportname);
});

ipcMain.on("readDir", (event, { path }) => {
  const files = readDirectory(path); // Call the function to read the directory

  //onScan(files)
  console.log("Received files from main process:", files);
});

ipcMain.on("readDirX", (event, { path, onScan }) => {
  const files = readDirectory(path); // Call the function to read the directory
  onScan(files);
});

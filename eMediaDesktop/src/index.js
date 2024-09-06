process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  Tray,
  shell,
  screen,
} = require("electron");
const rp = require("request-promise");
const mime = require("mime-types");
const path = require("path");
const log = require("electron-log");
const FormData = require("form-data");
const Store = require("electron-store");
const { parse: parseURL } = require("url");
const fs = require("fs");
const { EventEmitter } = require("events");
const axios = require("axios");
const extName = require("ext-name");
const fileWatcher = require("chokidar");
const OS = require("os");
const computerName = OS.userInfo().username + OS.hostname();

let defaultWorkDirectory = app.getPath("home") + "/eMedia/";

let connectionOptions = {
  headers: {
    "X-computername": computerName,
  },
};

const isDev = process.env.NODE_ENV === "development";

if (isDev) {
  try {
    require("electron-reloader")(module, {
      ignore: ["dist", "build", "node_modules"],
    });
  } catch (err) {
    console.error(err);
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
const console = {
  log: function (...args) {
    if (!mainWindow) return;
    log.log.apply(this, args);
    if (mainWindow.webContents) {
      if (Array.isArray(args) && args.length === 1) {
        args = args[0];
      }
      mainWindow.webContents.send("electron-log", args);
    }
  },
  error: function (...args) {
    if (!mainWindow) return;
    log.error.apply(this, args);
    if (mainWindow.webContents) {
      if (Array.isArray(args) && args.length === 1) {
        args = args[0];
      }
      mainWindow.webContents.send("electron-error", args);
    }
  },
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

const createWindow = () => {
  let bounds = store.get("lastBounds");
  if (!bounds) {
    const display = screen.getPrimaryDisplay();
    bounds = display.bounds;
  }
  mainWindow = new BrowserWindow({
    x: bounds.x + 50,
    y: bounds.y + 50,
    width: bounds.width,
    height: bounds.height,
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
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

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
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (watcher) {
    watcher.close();
  }
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    store.set("lastBounds", bounds);
    mainWindow.removeAllListeners("close");
    mainWindow.destroy();
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
  const url = new URL(homeUrl);
  url.searchParams.append("desktopname", computerName);
  log.info("Opening Workspace: ", url.toString());
  let userAgent = mainWindow.webContents.getUserAgent();
  if (userAgent.indexOf("ComputerName") === -1) {
    userAgent = userAgent + " ComputerName/" + computerName;
  }
  mainWindow.loadURL(url.toString(), { userAgent });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("set-local-root", defaultWorkDirectory);
  });
}

ipcMain.on("changeLocalDrive", (_, newRoot) => {
  if (fs.existsSync(newRoot)) {
    const currentHome = store.get("homeUrl");
    let workspaces = store.get("workspaces") || [];
    workspaces = workspaces.map((w) => {
      if (w.url === currentHome) {
        w.drive = newRoot;
      }
      return w;
    });
    store.set("workspaces", workspaces);
    store.set("localDrive", newRoot);
    defaultWorkDirectory = newRoot;
    mainWindow.webContents.send("set-local-root", defaultWorkDirectory);
  }
});

ipcMain.on("setConnectionOptions", (_, options) => {
  connectionOptions = {
    ...options,
    headers: {
      ...options.headers,
      "X-computername": computerName,
    },
  };
  store.set("mediadburl", options.mediadb);
  mainWindow.webContents.send("desktopReady");
});

let watcher;
const watchedPaths = [];
async function StartWatcher(workPath) {
  if (!fs.existsSync(workPath)) {
    return;
  }
  if (!watcher) {
    watcher = fileWatcher.watch(workPath, {
      ignored: /[\/\\]\./,
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
    });
    watcher
      .on("add", (p) => {
        mainWindow.webContents.send("auto-file-added", p);
      })
      .on("error", (error) => {
        console.log("Chokidar error:", error);
      })
      .on("ready", () => {
        console.log("Watching for changes on", workPath);
      });
  } else {
    watcher.add(workPath);
  }

  watchedPaths.push(workPath);
}

let batchWatcher;
const currentlyWatching = [];
ipcMain.on("watchFolders", (_, folders) => {
  const currentWatchedIds = currentlyWatching.map((f) => f.id);
  const uniqueFolders = folders.filter(
    (f) => !currentWatchedIds.includes(f.id)
  );
  const tempTotal = uniqueFolders.length + currentlyWatching.length;
  if (tempTotal > 50) {
    const toRemove = currentlyWatching.slice(0, tempTotal - 50);
    currentlyWatching = currentlyWatching.slice(toRemove.length);
    toRemovePaths = toRemove.map((f) => f.path);
    if (batchWatcher) {
      batchWatcher.unwatch(toRemovePaths);
    }
  } else {
    currentlyWatching.push(...uniqueFolders);
  }
  const folderFullPaths = uniqueFolders.map((f) =>
    path.join(defaultWorkDirectory, f.path)
  );
  const validPaths = folderFullPaths.filter((f) => fs.existsSync(f));
  if (validPaths.length === 0) {
    return;
  }
  if (batchWatcher) {
    batchWatcher.add(validPaths);
  } else {
    batchWatcher = fileWatcher.watch(validPaths, {
      ignored: /[\/\\]\./,
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
    });
    batchWatcher.on("add", (p) => {
      const filePath = p.replace(defaultWorkDirectory, "");
      const catPath = path.dirname(filePath);
      mainWindow.webContents.send("file-added", catPath);
    });
  }
});

ipcMain.on("setModule", (_, { selectedModule, desktopId }) => {
  let absPaths = store.get("moduleSources") || {};
  let absPath = absPaths[selectedModule.moduleid];
  if (!absPath) {
    absPath = path.join(defaultWorkDirectory, selectedModule.modulename);
    store.set("moduleSources", {
      ...absPaths,
      [selectedModule.moduleid]: absPath,
    });
  }
  // const formData = new FormData();
  // formData.append("field", "desktopid");
  // formData.append("desktopid.value", desktopId);
  // formData.append("field", "moduleid");
  // formData.append("moduleid.value", selectedModule.moduleid);
  // formData.append("field", "localpath");
  // formData.append("localpath.value", absPath);
  // // formData.append("field", "lastscan");
  // // formData.append("lastscan.value", Date.now());

  const contents = scanDirectory(absPath);

  // axios
  //   .post(getMediaDbUrl() + "")
  //   .then((res) => {})
  //   .catch((err) => {});

  mainWindow.webContents.send("set-module-contents", contents);
});

class UploadBarrier extends EventEmitter {
  constructor() {
    super();
    this.allowed = true;
  }
  allow() {
    this.allowed = true;
  }
  prevent() {
    this.allowed = false;
    this.emit("prevented");
  }
}

class UploadManager {
  constructor(barrier, maxConcurrentUploads = 4) {
    this.uploadQueue = [];
    this.maxConcurrentUploads = maxConcurrentUploads;
    this.currentUploads = 0;
    this.totalUploadsCount = 0;
    this.barrier = barrier;
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
    if (!this.barrier.allowed) {
      return;
    }
    const uploadPromise = this.createUploadPromise(
      uploadEntityId,
      {
        jsonrequest: JSON.stringify(jsonData),
        filePath: filePath,
      },
      {
        onStarted,
        onProgress,
        onCancel,
        onCompleted,
        onError,
      }
    );

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

          let size = fs.statSync(formData.filePath).size;
          let loaded = 0;
          const uploadRequest = rp({
            method: "POST",
            uri: getMediaDbUrl() + "/services/module/asset/create",
            formData: {
              jsonrequest: formData.jsonrequest,
              file: {
                value: fs
                  .createReadStream(formData.filePath)
                  .on("data", (chunk) => {
                    loaded += chunk.length;
                    if (typeof callbacks.onProgress === "function") {
                      callbacks.onProgress({
                        id: uploadEntityId,
                        loaded,
                        total: size,
                      });
                    }
                  }),
                options: {
                  filename: path.basename(formData.filePath),
                  contentType: mime.contentType(
                    path.extname(formData.filePath)
                  ),
                },
              },
            },
            headers: connectionOptions.headers,
          });
          uploadRequest.then(() => {
            if (typeof callbacks.onCompleted === "function") {
              callbacks.onCompleted(uploadEntityId);
            }
          });
          this.barrier.once("prevented", () => {
            uploadRequest.abort();
            uploadRequest.cancel();
          });
        } catch (error) {
          if (typeof callbacks.onError === "function") {
            console.log(error);
            callbacks.onError(
              uploadEntityId,
              error.message || JSON.stringify(error) || "Unknown error"
            );
          }
        } finally {
          this.currentUploads--;
          this.totalUploadsCount--;
          this.processQueue();
        }
      },
      cancel: () => {
        this.currentUploads = 0;
        this.uploadQueue = [];
        this.totalUploadsCount = 0;
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

  cancelUpload() {
    this.barrier.prevent();
    this.currentUploads = 0;
    this.uploadQueue = [];
    this.totalUploadsCount = 0;
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

ipcMain.on("refreshStats", (_, directories) => {
  let stats = {};
  Object.keys(directories).forEach((id) => {
    const localPath = directories[id].localPath;
    if (!fs.existsSync(localPath)) {
      return;
    }
    stats[id] = getDirectoryStats(localPath);
  });
  mainWindow.webContents.send("stats", stats);
});

function getFilesByDirectory(directory) {
  let filePaths = [];
  let files = fs.readdirSync(directory);
  files.forEach((file) => {
    if (file.startsWith(".")) return;
    let filepath = path.join(directory, file);
    let stats = fs.statSync(filepath);
    if (stats.isFile()) {
      filePaths.push({ path: file, size: stats.size, abspath: filepath });
    }
  });
  return {
    files: filePaths,
  };
}

const autoUploadCounter = new UploadCounter();
const autoUploadBarrier = new UploadBarrier();
const autoUploadManager = new UploadManager(autoUploadBarrier);

async function uploadAutoFolders(folders, index = 0) {
  if (folders.length === index) {
    mainWindow.webContents.send("auto-upload-complete");
    autoUploadCounter.removeAllListeners("completed");
    return;
  }

  autoUploadCounter.once("completed", async () => {
    await uploadAutoFolders(folders, index + 1);
  });

  const folder = folders[index];
  const fetchPath = folder.localPath;

  let data = {};
  if (fs.existsSync(fetchPath)) {
    data = getFilesByDirectory(fetchPath, true);
  } else {
    data = { files: [] };
  }
  data.categorypath = folder.categoryPath;
  data.entityid = folder.entityId;
  await axios
    .post(
      getMediaDbUrl() + "/services/module/asset/entity/pullpendingfiles.json",
      data,
      { headers: connectionOptions.headers }
    )
    .then(function (res) {
      if (res.data !== undefined) {
        const filesToUpload = res.data.filestoupload;
        if (filesToUpload !== undefined) {
          autoUploadCounter.setTotal(filesToUpload.length);
          filesToUpload.forEach((item) => {
            const filePath = path.join(fetchPath, item.path);
            if (!autoUploadBarrier.allowed) {
              autoUploadBarrier.allow();
            }
            autoUploadManager.uploadFile({
              uploadEntityId: folder.entityId,
              filePath: filePath,
              jsonData: {
                sourcepath: path.join(folder.categoryPath, item.path),
              },
              onProgress: ({ loaded }) => {
                mainWindow.webContents.send("auto-upload-progress", loaded);
              },
              onCompleted: () => {
                mainWindow.webContents.send("auto-upload-next", {
                  id: folder.entityId,
                  size: fs.statSync(filePath).size || 0,
                });
                autoUploadCounter.incrementCompleted();
              },
              onError: (id, err) => {
                autoUploadCounter.incrementCompleted();
                mainWindow.webContents.send("auto-upload-error", {
                  id,
                  error: err,
                });
              },
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
      autoUploadCounter.setTotal(0);
      console.error("Error on upload/AutoFolders: " + category.path);
      console.error(err);
    });
}

function getDirectories(path) {
  const directories = [];
  directories.push(path);
  function fetchDirectories(path) {
    const items = fs.readdirSync(path);
    items.forEach((item) => {
      const itemPath = path + "/" + item;
      const stats = fs.statSync(itemPath);
      if (stats.isDirectory()) {
        directories.push(itemPath);
        directories.concat(fetchDirectories(itemPath));
      }
    });
  }
  fetchDirectories(path);
  return directories;
}

ipcMain.on("syncAllFolders", (_, syncFolders) => {
  const subfolders = [];
  const ids = [];
  syncFolders.forEach((folder) => {
    const localPath = folder.localPath;
    const folderId = folder.id;
    const categoryPath = folder.categoryPath;

    ids.push(folderId);

    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    if (watchedPaths.indexOf(localPath) === -1) {
      StartWatcher(localPath);
    }

    const directories = getDirectories(localPath);
    directories.forEach((dir) => {
      subfolders.push({
        id: folderId,
        localPath: dir,
        categoryPath: path.join(categoryPath, dir.replace(localPath, "")),
        entityId: folderId,
      });
    });
  });

  mainWindow.webContents.send("scan-completed", ids);
  uploadAutoFolders(subfolders);
});

ipcMain.on("abortAutoUpload", () => {
  autoUploadManager.cancelUpload();
});

ipcMain.on("abortUpload", () => {
  entityUploadManager.cancelUpload();
});

ipcMain.on("select-dirs", async (_, arg) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "multiSelections", "createDirectory"],
    defaultPath: arg.currentPath,
  });
  const selectedFolderPaths = result.filePaths;

  const folders = [];

  selectedFolderPaths.forEach((selectedFolderPath) => {
    const folderName = path.basename(selectedFolderPath);
    const stats = getDirectoryStats(selectedFolderPath);
    folders.push({
      name: folderName,
      path: selectedFolderPath,
      stats,
    });
  });
  mainWindow.webContents.send("selected-dirs", folders);
});

ipcMain.on("dir-picker", async (_, arg) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    defaultPath: arg.currentPath,
  });
  let rootPath = result.filePaths[0];
  mainWindow.webContents.send("dir-picked", {
    path: rootPath,
    targetDiv: arg.targetDiv,
  });
});

ipcMain.on("configDir", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
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

function setMainMenu(mainWindow) {
  const template = [
    {
      label: "Workspace",
      submenu: [
        {
          label: "Libraries",
          accelerator: "CmdOrCtrl+L",
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
  let inSourcepath = options["absPath"];
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
      console.error(err);
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
  form1.append("absPath", savingPath);
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
  // const q = parseURL(formurl, true);
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
      let absPath = path.join(savingPath, filenamefinal);
      absPath = absPath.split(path.sep).join(path.posix.sep);

      let form = new FormData();
      form.append("absPath", absPath);
      form.append("file", filestream);
      console.log("Uploading: " + absPath);
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
  if (path.match(/[\$\.\{\}]/g)) {
    console.error("Invalid path: " + path);
    console.log(parseURL("http://www.example.com"));
    console.log(new URL("http://www.example.com"));
    return;
  }
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
      { categorypath: categorypath },
      { headers: connectionOptions.headers }
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
      console.error("Error loading: " + url);
      console.error(err);
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

// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); // test

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
      openFolder(defaultWorkDirectory + categories[0].path);
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
      openFolder(defaultWorkDirectory + categories[0].path);
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
    data = readDirectory(fetchpath, false);
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
      console.error("Error on download Folder: " + category.path);
      console.error(err);
    });
};

function getMediaDbUrl() {
  const mediadburl = store.get("mediadburl");
  if (!mediadburl) {
    console.error("No MediaDB url found");
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

ipcMain.on("uploadAll", async (_, { categorypath, entityId }) => {
  fetchSubFolderContent(
    defaultWorkDirectory,
    categorypath,
    uploadFilesRecursive,
    [0, { entityId: entityId }]
  );
});

const entityUploadCounter = new UploadCounter();
const entityUploadBarrier = new UploadBarrier();
const entityUploadManager = new UploadManager(entityUploadBarrier);

async function uploadFilesRecursive(categories, index = 0, options = {}) {
  if (categories.length === index) {
    mainWindow.webContents.send("entity-upload-complete");
    entityUploadCounter.removeAllListeners("completed");
    return;
  }

  entityUploadCounter.once("completed", async () => {
    await uploadFilesRecursive(categories, index + 1, options);
  });

  const category = categories[index];
  const fetchPath = defaultWorkDirectory + category.path;

  let data = {};
  if (fs.existsSync(fetchPath)) {
    data = readDirectory(fetchPath, true);
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
        const filesToUpload = res.data.filestoupload;
        if (filesToUpload !== undefined) {
          entityUploadCounter.setTotal(filesToUpload.length);
          filesToUpload.forEach((item) => {
            const filePath = path.join(fetchPath, item.path);
            if (!entityUploadBarrier.allowed) {
              entityUploadBarrier.allow();
            }
            entityUploadManager.uploadFile({
              uploadEntityId: options["entityId"],
              filePath: filePath,
              jsonData: {
                sourcepath: path.join(category.path, item.path),
              },
              onProgress: ({ id, loaded }) => {
                console.log("Progress: " + loaded);
                mainWindow.webContents.send("entity-upload-progress", {
                  id,
                  index: category.index,
                  loaded,
                });
              },
              onCompleted: () => {
                const f = fs.statSync(filePath);
                mainWindow.webContents.send("entity-upload-next", {
                  id: options["entityId"],
                  index: category.index,
                  size: f.size,
                });
                entityUploadCounter.incrementCompleted();
              },
              onError: (id, err) => {
                entityUploadCounter.incrementCompleted();
                mainWindow.webContents.send("entity-upload-error", {
                  id,
                  index: category.index,
                  error: err,
                });
              },
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
      entityUploadCounter.setTotal(0);
      console.error("Error on upload/FilesRecursive: " + category.path);
      console.error(err);
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
            const localPath = path.join(fetchpath, item.path);
            if (fs.existsSync(localPath)) {
              shell.trashItem(localPath);
            }
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
      console.error("Error on trashFilesRecursive: " + category.path);
      console.error(err);
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
  const parsedUrl = parseURL(store.get("homeUrl"), true);

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
  const parsedUrl = parseURL(store.get("homeUrl"), true);

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
  const parsedUrl = parseURL(store.get("homeUrl"), true);
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

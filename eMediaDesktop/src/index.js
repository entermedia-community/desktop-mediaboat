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
  session,
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
const demos = require("./assets/demos.json");
const fileWatcher = require("chokidar");
const OS = require("os");

const { download: eDownload, CancelError } = require("electron-dl");

const computerName = OS.userInfo().username + OS.hostname();

let defaultWorkDirectory = app.getPath("home") + "/eMedia/";
let currentWorkDirectory = defaultWorkDirectory;

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
let loaderWindow;
let entermediaKey;

//Config
const appLogo = "/assets/images/icon.png";
const trayLogo = "/assets/images/em.png";

const store = new Store();
const loaderPage = `file://${__dirname}/loader.html`;
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
    currentWorkDirectory = localDrive;
    openWorkspace(homeUrl);
  }
  // Open the DevTools.
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Main Menu
  setMainMenu(mainWindow);

  // tray
  new CreateTray(mainWindow).drawTray();

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
  if (autoFolderWatcher) {
    autoFolderWatcher.close();
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
  });
  setMainMenu(mainWindow);
});

ipcMain.on("welcomeDone", () => {
  store.set("welcomeDone", true);
});

ipcMain.on("addWorkspace", (_, newWorkspace) => {
  let workspaces = store.get("workspaces") || [];
  workspaces = workspaces.filter((w) => w.url);
  let drive = defaultWorkDirectory;
  const editMode = workspaces.find((w) => w.url === newWorkspace.url);
  if (!editMode) {
    newWorkspace.drive = drive;
    workspaces.push(newWorkspace);
  } else {
    drive = editMode.drive;
    workspaces = workspaces.map((w) => {
      if (w.url === newWorkspace.url) {
        return {
          ...newWorkspace,
          drive: w.drive,
        };
      }
      return w;
    });
  }
  store.set("workspaces", workspaces);
  if (newWorkspace.url === store.get("homeUrl")) {
    currentWorkDirectory = drive;
    store.set("localDrive", drive);
  }
  mainWindow.webContents.send("workspaces-updated", workspaces);
  setMainMenu(mainWindow);
});

ipcMain.on("deleteWorkspace", (_, url) => {
  let workspaces = store.get("workspaces") || [];
  workspaces = workspaces.filter((w) => w.url !== url);
  store.set("workspaces", workspaces);
  const homeUrl = store.get("homeUrl");
  if (homeUrl === url) {
    store.delete("homeUrl");
  }
  setMainMenu(mainWindow);
});

function showLoader() {
  const bounds = mainWindow.getBounds();

  loaderWindow = new BrowserWindow({
    ...bounds,
    resizable: false,
    frame: false,
    parent: mainWindow,
  });
  loaderWindow.loadURL(loaderPage);
  loaderWindow.show();
}

function openWorkspace(homeUrl) {
  log.info("Opening Workspace: ", homeUrl);

  let userAgent = mainWindow.webContents.getUserAgent();
  if (userAgent.indexOf("ComputerName") === -1) {
    userAgent = userAgent + " ComputerName/" + computerName;
  }

  showLoader();

  mainWindow.loadURL(homeUrl, { userAgent });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("set-local-root", currentWorkDirectory);
    if (loaderWindow) loaderWindow.destroy();
  });
  setMainMenu(mainWindow);
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
    currentWorkDirectory = newRoot;
    mainWindow.webContents.send("set-local-root", currentWorkDirectory);
  }
});

ipcMain.on("setConnectionOptions", (_, options) => {
  let homeUrl = store.get("homeUrl");
  if (!homeUrl) return;
  const parsedUrl = parseURL(homeUrl);
  const filter = { urls: ["*" + "://" + parsedUrl.hostname + "/*"] };
  session.defaultSession.webRequest.onBeforeSendHeaders(
    filter,
    (details, callback) => {
      Object.keys(options.headers).forEach((header) => {
        details.requestHeaders[header] = options.headers[header];
      });
      callback({ requestHeaders: details.requestHeaders });
    }
  );

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

let autoFolderWatcher;
const watchedAutoFolders = [];
async function StartWatcher(workPath) {
  if (!fs.existsSync(workPath)) {
    return;
  }
  if (!autoFolderWatcher) {
    autoFolderWatcher = fileWatcher.watch(workPath, {
      ignored: /^\./,
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
    });
    autoFolderWatcher
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
    autoFolderWatcher.add(workPath);
  }

  watchedAutoFolders.push(workPath);
}

let entityWatcher;
const watchedEntities = [];
ipcMain.on("watchFolders", (_, folders) => {
  const currentWatchedIds = watchedEntities.map((f) => f.id);
  const uniqueFolders = folders.filter(
    (f) => !currentWatchedIds.includes(f.id)
  );
  const tempTotal = uniqueFolders.length + watchedEntities.length;
  if (tempTotal > 50) {
    const toRemove = watchedEntities.slice(0, tempTotal - 50);
    watchedEntities = watchedEntities.slice(toRemove.length);
    toRemovePaths = toRemove.map((f) => f.path);
    if (entityWatcher) {
      entityWatcher.unwatch(toRemovePaths);
    }
  } else {
    watchedEntities.push(...uniqueFolders);
  }
  const folderFullPaths = uniqueFolders.map((f) =>
    path.join(currentWorkDirectory, f.path)
  );
  const validPaths = folderFullPaths.filter((f) => fs.existsSync(f));
  if (validPaths.length === 0) {
    return;
  }
  if (entityWatcher) {
    entityWatcher.add(validPaths);
  } else {
    entityWatcher = fileWatcher.watch(validPaths, {
      ignored: /[\/\\]\./,
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
    });
    entityWatcher.on("add", (p) => {
      const filePath = p.replace(currentWorkDirectory, "");
      const catPath = path.dirname(filePath);
      mainWindow.webContents.send("file-added", catPath);
    });
    entityWatcher.on("unlink", (p) => {
      const filePath = p.replace(currentWorkDirectory, "");
      const catPath = path.dirname(filePath);
      mainWindow.webContents.send("file-removed", catPath);
    });
    entityWatcher.on("unlinkDir", (p) => {
      const filePath = p.replace(currentWorkDirectory, "");
      const catPath = path.dirname(filePath);
      mainWindow.webContents.send("file-removed", catPath);
    });
  }
});

function getMediaDbUrl(url) {
  const mediaDbUrl = store.get("mediadburl");
  if (!mediaDbUrl) {
    console.error("No MediaDB url found");
    return url;
  }
  return mediaDbUrl + "/" + url;
}

class UploadManager {
  constructor(maxConcurrentUploads = 4) {
    this.uploadQueue = [];
    this.maxConcurrentUploads = maxConcurrentUploads;
    this.currentUploads = 0;
    this.totalUploadsCount = 0;
    this.activeUploadRequests = {};
    this.isCancelled = false;
  }

  async uploadFile({
    subFolderId,
    sourcePath,
    filePath,
    onStarted,
    onCancel,
    onProgress,
    onCompleted,
    onError,
  }) {
    if (this.isCancelled) {
      console.log("Cancelled uploading");
      return;
    }
    const uploadPromise = this.createUploadPromise(
      subFolderId,
      { sourcePath, filePath },
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

  createUploadPromise(subFolderId, formData, callbacks) {
    return {
      start: async () => {
        try {
          if (typeof callbacks.onStarted === "function") {
            callbacks.onStarted(subFolderId);
          }

          let size = fs.statSync(formData.filePath).size;
          let loaded = 0;

          const jsonrequest = {
            sourcepath: formData.sourcePath,
            filesize: size,
          };

          const uploadRequest = rp({
            method: "POST",
            uri: getMediaDbUrl("services/module/asset/create"),
            formData: {
              jsonrequest: JSON.stringify(jsonrequest),
              file: {
                value: fs
                  .createReadStream(formData.filePath)
                  .on("data", (chunk) => {
                    loaded += chunk.length;
                    if (typeof callbacks.onProgress === "function") {
                      callbacks.onProgress({
                        id: subFolderId,
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
              callbacks.onCompleted(subFolderId);
              delete this.activeUploadRequests[formData.filePath];
            }
          });
          this.activeUploadRequests[formData.filePath] = uploadRequest;
        } catch (error) {
          if (typeof callbacks.onError === "function") {
            console.log(error);
            callbacks.onError(
              subFolderId,
              error.message || JSON.stringify(error) || "Unknown error"
            );
            delete this.activeUploadRequests[formData.filePath];
          }
        } finally {
          this.currentUploads--;
          this.totalUploadsCount--;
          this.processQueue();
        }
      },
      // cancel: () => {
      //   this.currentUploads = 0;
      //   this.uploadQueue = [];
      //   this.totalUploadsCount = 0;
      //   if (typeof callbacks.onCancel === "function") {
      //     callbacks.onCancel();
      //   }
      // },
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

  cancelAllUpload() {
    this.isCancelled = true;
    Object.keys(this.activeUploadRequests).forEach((key) => {
      this.activeUploadRequests[key].abort();
      this.activeUploadRequests[key].cancel();
    });
    this.activeUploadRequests = {};
    this.currentUploads = 0;
    this.uploadQueue = [];
    this.totalUploadsCount = 0;
    this.isCancelled = false;
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
const autoUploadManager = new UploadManager();

let lastAutoProgUpdate = 0;
let lastUploadedFolder = [];
async function uploadAutoFolders(folders, index = 0) {
  if (folders.length === index) {
    mainWindow.webContents.send("auto-upload-all-complete", lastUploadedFolder);
    lastUploadedFolder = [];
    autoUploadCounter.removeAllListeners("completed");
    return;
  }

  autoUploadCounter.once("completed", async () => {
    await uploadAutoFolders(folders, index + 1);
  });

  const folder = folders[index];

  if (lastUploadedFolder.length !== 2) {
    lastUploadedFolder = [folder.syncFolderId, 0];
  }

  const fetchPath = folder.localPath;

  let data = {};
  if (fs.existsSync(fetchPath)) {
    data = getFilesByDirectory(fetchPath, true);
  } else {
    data = { files: [] };
  }
  data.categorypath = folder.categoryPath;

  await axios
    .post(
      getMediaDbUrl("services/module/asset/entity/pullpendingfiles.json"),
      data,
      { headers: connectionOptions.headers }
    )
    .then(function (res) {
      if (res.data !== undefined) {
        const filesToUpload = res.data.filestoupload;
        if (filesToUpload !== undefined) {
          lastUploadedFolder[1] += filesToUpload.length;
          if (
            filesToUpload.length === 0 &&
            lastUploadedFolder[0] !== folder.syncFolderId
          ) {
            mainWindow.webContents.send(
              "auto-upload-each-complete",
              lastUploadedFolder
            );
          }
          autoUploadCounter.setTotal(filesToUpload.length);
          filesToUpload.forEach((item) => {
            const filePath = path.join(fetchPath, item.path);
            autoUploadManager.uploadFile({
              subFolderId: folder.syncFolderId,
              filePath: filePath,
              sourcePath: path.join(folder.categoryPath, item.path),
              onProgress: ({ loaded }) => {
                if (lastAutoProgUpdate + 1000 < Date.now()) {
                  lastAutoProgUpdate = Date.now();
                  mainWindow.webContents.send("auto-upload-progress", loaded);
                }
              },
              onCompleted: () => {
                if (lastUploadedFolder[0] !== folder.syncFolderId) {
                  mainWindow.webContents.send(
                    "auto-upload-entity-complete",
                    lastUploadedFolder
                  );
                }
                lastUploadedFolder[0] = folder.syncFolderId;
                mainWindow.webContents.send("auto-upload-next", {
                  id: folder.syncFolderId,
                  size: fs.statSync(filePath).size || 0,
                });
                autoUploadCounter.incrementCompleted();
              },
              onError: (id, err) => {
                lastUploadedFolder[0] = folder.syncFolderId;
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

function getDirectories(p) {
  const directories = [];
  directories.push(p);
  function fetchDirectories(p) {
    const items = fs.readdirSync(p);
    items.forEach((item) => {
      const itemPath = path.join(p, item);
      const stats = fs.statSync(itemPath);
      if (stats.isDirectory()) {
        directories.push(itemPath);
        directories.concat(fetchDirectories(itemPath));
      }
    });
  }
  fetchDirectories(p);
  return directories;
}

ipcMain.on("syncAutoFolders", (_, syncFolders) => {
  const subfolders = [];
  const ids = [];
  syncFolders.forEach((folder) => {
    const localPath = folder.localPath;
    const folderId = folder.syncFolderId;
    const categoryPath = folder.categoryPath;

    ids.push(folderId);

    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    if (watchedAutoFolders.indexOf(localPath) === -1) {
      StartWatcher(localPath);
    }

    const directories = getDirectories(localPath);
    directories.forEach((dir) => {
      subfolders.push({
        syncFolderId: folderId,
        localPath: dir,
        categoryPath: path.join(categoryPath, dir.replace(localPath, "")),
      });
    });
  });

  mainWindow.webContents.send("scan-auto-folder-completed", ids);
  uploadAutoFolders(subfolders);
});

ipcMain.on("cancelAutoUpload", () => {
  autoUploadManager.cancelAllUpload();
  mainWindow.webContents.send("upload-canceled");
});

ipcMain.on("abortUpload", () => {
  entityUploadManager.cancelAllUpload();
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

ipcMain.on("openWorkspace", (_, url) => {
  const workSpaces = store.get("workspaces") || [];
  let drive = defaultWorkDirectory;
  const selectedWorkspace = workSpaces.find((w) => w.url === url);
  if (selectedWorkspace && selectedWorkspace.drive) {
    drive = selectedWorkspace.drive;
  }

  if (!drive.endsWith("/")) {
    drive += "/";
  }
  currentWorkDirectory = drive;
  store.set("localDrive", drive);
  store.set("homeUrl", url);
  openWorkspace(url);
});

ipcMain.on("openExternal", (_, url) => {
  shell.openExternal(url);
});

function getWorkSpaceMenu() {
  const workspaces = store.get("workspaces") || [];
  let subMenus = [];
  if (workspaces.length === 0) {
    subMenus = [{ label: "Nothing to show", enabled: false }];
  }
  subMenus = workspaces.map((ws) => {
    return {
      label: ws.name,
      id: ws.url,
      type: "radio",
      checked: ws.url === store.get("homeUrl"),
      click() {
        if (ws.drive) {
          currentWorkDirectory = ws.drive;
        } else {
          ws.drive = defaultWorkDirectory;
        }
        store.set("homeUrl", ws.url);
        store.set("localDrive", ws.drive);
        openWorkspace(ws.url);
      },
    };
  });
  subMenus.push({ type: "separator" });
  const demoMenu = [];
  Object.keys(demos).forEach((key) => {
    demoMenu.push({
      label: key,
      id: demos[key],
      type: "radio",
      checked: demos[key] === store.get("homeUrl"),
      click() {
        store.set("homeUrl", demos[key]);
        store.set("localDrive", defaultWorkDirectory);
        currentWorkDirectory = defaultWorkDirectory;
        openWorkspace(demos[key]);
      },
    });
  });
  subMenus.push({
    label: "Demo Libraries",
    submenu: demoMenu,
  });
  subMenus.push({ type: "separator" });
  subMenus.push({
    label: "Add Library",
    click() {
      openWorkspacePicker(welcomeForm);
    },
  });
  return subMenus;
}

function setMainMenu(mainWindow) {
  const homeUrl = store.get("homeUrl");
  const template = [
    {
      label: "eMedia Library",
      submenu: [
        {
          label: "Home",
          click: () => {
            mainWindow.show();
            mainWindow.loadURL(homeUrl);
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
        // { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
        // { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
        // { type: "separator" },
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
      label: "Libraries",
      id: "workspaces",
      submenu: getWorkSpaceMenu(),
    },
    {
      label: "Browser",
      submenu: [
        {
          label: "Refresh",
          accelerator: "CmdOrCtrl+R",
          click() {
            showLoader();
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

class CreateTray {
  constructor(mainWin) {
    this.mainWin = mainWin;
    this.trayMenu = [];
    this.homeUrl = store.get("homeUrl");
    this.tray = new Tray(__dirname + trayLogo);
  }

  drawTray() {
    this.trayMenu.push({
      label: "Show App",
      click: () => {
        this.mainWin.show();
      },
    });
    this.trayMenu.push({
      label: "Home",
      click: () => {
        this.mainWin.show();
        this.mainWin.loadURL(this.homeUrl);
      },
    });
    this.trayMenu.push({ type: "separator" });
    this.trayMenu.push({
      label: "Libraries...    ",
      click() {
        openWorkspacePicker(welcomeForm);
      },
    });
    this.trayMenu.push({ type: "separator" });
    this.trayMenu.push({
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    });
    this.tray.setToolTip("eMedia Library");
    const contextMenu = Menu.buildFromTemplate(this.trayMenu);
    this.tray.setContextMenu(contextMenu);
  }
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
  //let directoryfinal = directory.replace(currentWorkDirectory, ''); //remove user home
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
  let savingPath = path.join(inSourcepath, dirname);
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
        let filenamefinal = filepath.replace(currentWorkDirectory, ""); //remove user home
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
      let filenamefinal = filepath.replace(currentWorkDirectory, ""); //remove user home
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
    rootPath = path.dirname(path.join(currentWorkDirectory, categoryPath));
    rootLevel = categoryPath.split("/").length;
    shouldUpdateTree = false;
    filter = path.basename(path.join(currentWorkDirectory, categoryPath));
  } else {
    rootPath = path.join(currentWorkDirectory, categories[0].path);
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
        let categoryPath = fullpath.substring(currentWorkDirectory.length);
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
  const url = getMediaDbUrl("services/module/asset/entity/pullfolderlist.json");
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
          if (categories.length > 0) {
            const dir = path.join(rootPath, categories[0].path);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
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

ipcMain.on("downloadAll", (_, categorypath) => {
  fetchSubFolderContent(
    currentWorkDirectory,
    categorypath,
    downloadFilesRecursive
  );
});

async function scanFilesRecursive(categories, index = 0) {
  if (categories.length === index) {
    mainWindow.webContents.send("scan-entity-complete");
    return;
  }

  let category = categories[index];
  let fetchPath = path.join(currentWorkDirectory, category.path);

  let data = {};
  if (fs.existsSync(fetchPath)) {
    data = readDirectory(fetchPath, false);
  }
  data.categorypath = category.path;

  await axios
    .post(
      getMediaDbUrl("services/module/asset/entity/pullpendingfiles.json"),
      data,
      {
        headers: connectionOptions.headers,
      }
    )
    .then(function (res) {
      if (res.data !== undefined) {
        const filesToDownload = res.data.filestodownload;
        const filesToUpload = res.data.filestoupload;
        if (filesToDownload !== undefined) {
          let folderDownloadSize = 0;
          filesToDownload.forEach((item) => {
            folderDownloadSize += parseInt(item.size);
          });
          let folderUploadSize = 0;
          filesToUpload.forEach((item) => {
            folderUploadSize += parseInt(item.size);
          });
          mainWindow.webContents.send("scan-entity-progress", {
            ...category,
            downloadSize: folderDownloadSize,
            downloadCount: filesToDownload.length,
            uploadSize: folderUploadSize,
            uploadCount: filesToUpload.length,
          });
          scanFilesRecursive(categories, index + 1);
        } else {
          throw new Error("No files found");
        }
      } else {
        throw new Error("No data found");
      }
    })
    .catch(function (err) {
      console.error("Error on scan Folder: " + category.path);
      console.error(err);
    });
}

ipcMain.on("scanAll", (_, categorypath) => {
  fetchSubFolderContent(currentWorkDirectory, categorypath, scanFilesRecursive);
});

class DownloadManager {
  constructor() {
    this.downloadItems = {};
    this.downloadQueue = [];
    this.isDownloading = false;
    this.isCancelled = false;
  }

  async downloadFile({
    downloadItemId,
    downloadUrl,
    directory = undefined,
    onStarted = () => {},
    onCancel = () => {},
    onTotalProgress = () => {},
    onProgress = () => {},
    onCompleted = () => {},
    openFolderWhenDone = false,
  }) {
    if (!downloadItemId) {
      console.error("Invalid downloadItemId");
      return;
    }
    if (!downloadUrl) {
      console.error("Invalid downloadUrl");
      return;
    }
    if (directory !== undefined) {
      if (!fs.existsSync(directory)) {
        try {
          fs.mkdirSync(directory, { recursive: true });
        } catch (e) {
          console.error(directory + " doesn't exist");
          return;
        }
      }
    }
    if (this.isCancelled) {
      console.log("Cancelled downloading");
      return;
    }
    const downloadPromise = this.createDownloadPromise({
      downloadItemId,
      downloadUrl,
      directory,
      onProgress,
      onStarted,
      onTotalProgress,
      onCompleted,
      onCancel,
      openFolderWhenDone,
    });

    this.downloadQueue.push(downloadPromise);
    this.processQueue();
  }

  createDownloadPromise({
    downloadItemId,
    downloadUrl,
    directory,
    onProgress,
    onCancel,
    onStarted,
    onCompleted,
    onTotalProgress,
    onError,
    openFolderWhenDone,
  }) {
    return {
      start: async () => {
        console.log("Downloading: " + downloadUrl);
        try {
          const downloadItem = await eDownload(mainWindow, downloadUrl, {
            directory,
            onStarted,
            onTotalProgress,
            onProgress,
            onCancel,
            onCompleted,
            openFolderWhenDone,
            overwrite: true,
            saveAs: directory === undefined,
            showBadge: false,
          });
          this.downloadItems[downloadItemId] = downloadItem;
        } catch (e) {
          console.log("Error downloading " + downloadUrl);
          console.log(e.message || e);
          if (e instanceof CancelError) {
            onCancel();
          } else {
            onError(e);
          }
        } finally {
          this.isDownloading = false;
          this.processQueue();
        }
      },
    };
  }

  processQueue() {
    if (!this.isDownloading && this.downloadQueue.length > 0) {
      const nextDownload = this.downloadQueue.shift();
      this.isDownloading = true;
      nextDownload.start();
    }
  }

  cancelAllDownload() {
    this.isCancelled = true;
    Object.keys(this.downloadItems).forEach((downloadItemId) => {
      const download = this.downloadItems[downloadItemId];
      if (download) {
        download.cancel();
      }
    });
    this.downloadItems = {};
    this.isDownloading = false;
    this.downloadQueue = [];
    this.isCancelled = false;
  }
}

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

const batchDownloadManager = new DownloadManager();
const batchDownloadCounter = new DownloadCounter();

// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); // test

let lastBatchDlProgUpdate = 0;
async function downloadFilesRecursive(categories, index = 0) {
  if (categories.length === index) {
    mainWindow.webContents.send("download-batch-complete");
    batchDownloadCounter.removeAllListeners("completed");
    return;
  }

  batchDownloadCounter.once("completed", async () => {
    await downloadFilesRecursive(categories, index + 1);
  });

  let category = categories[index];
  let fetchPath = path.join(currentWorkDirectory, category.path);

  let data = {};
  if (fs.existsSync(fetchPath)) {
    data = readDirectory(fetchPath, false);
  }

  data.categorypath = category.path;

  await axios
    .post(
      getMediaDbUrl("services/module/asset/entity/pullpendingfiles.json"),
      data,
      {
        headers: connectionOptions.headers,
      }
    )
    .then(function (res) {
      if (res.data !== undefined) {
        const filesToDownload = res.data.filestodownload;
        if (filesToDownload !== undefined) {
          batchDownloadCounter.setTotal(filesToDownload.length);
          filesToDownload.forEach((item) => {
            let assetId = item.id;
            const parsedUrl = parseURL(store.get("homeUrl"), true);
            batchDownloadManager.downloadFile({
              downloadItemId: assetId,
              downloadUrl:
                parsedUrl.protocol + "//" + parsedUrl.host + item.url,
              directory: path.join(currentWorkDirectory, category.path),
              onTotalProgress: ({ transferredBytes, totalBytes }) => {
                if (lastBatchDlProgUpdate + 1000 < Date.now()) {
                  lastBatchDlProgUpdate = Date.now();
                  mainWindow.webContents.send("download-batch-progress", {
                    transferredBytes,
                    totalBytes,
                  });
                }
              },
              onCompleted: () => {
                mainWindow.webContents.send("download-batch-next", {
                  categoryPath: category.path,
                  assetId,
                });
                batchDownloadCounter.incrementCompleted();
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
      batchDownloadCounter.setTotal(0);
      console.error("Error on download Folder: " + category.path);
      console.error(err);
    });
}

ipcMain.on("fetchFiles", (_, options) => {
  if (!options["categorypath"]) {
    return;
  }
  let fetchpath = path.join(currentWorkDirectory, options["categorypath"]);
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

ipcMain.on("openFolder", (_, options) => {
  if (!options["path"].startsWith("/")) {
    options["path"] = path.join(currentWorkDirectory, options["path"]);
  }
  openFolder(options["path"]);
});

ipcMain.on("uploadAll", async (_, { categorypath, entityId }) => {
  fetchSubFolderContent(
    currentWorkDirectory,
    categorypath,
    uploadFilesRecursive,
    [0, { entityId: entityId }]
  );
});

const entityUploadCounter = new UploadCounter();
const entityUploadManager = new UploadManager();

let lastEntityProgUpdate = 0;
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
  const fetchPath = path.join(currentWorkDirectory, category.path);

  let data = {};
  if (fs.existsSync(fetchPath)) {
    data = readDirectory(fetchPath, true);
  }
  data.categorypath = category.path;
  data.entityid = options["entityId"];
  await axios
    .post(
      getMediaDbUrl("services/module/asset/entity/pullpendingfiles.json"),
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
            entityUploadManager.uploadFile({
              subFolderId: options["entityId"],
              filePath: filePath,
              sourcePath: path.join(category.path, item.path),
              onProgress: ({ id, loaded }) => {
                if (lastEntityProgUpdate + 1000 < Date.now()) {
                  lastEntityProgUpdate = Date.now();
                  mainWindow.webContents.send("entity-upload-progress", {
                    id,
                    index: category.index,
                    loaded,
                  });
                }
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
    currentWorkDirectory,
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
  let fetchpath = path.join(currentWorkDirectory, category.path);
  let data = {};

  if (fs.existsSync(fetchpath)) {
    data = readDirectory(fetchpath, true);
  }

  data.categorypath = category.path;

  axios
    .post(
      getMediaDbUrl("services/module/asset/entity/pullpendingfiles.json"),
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

const indieDownloadManager = new DownloadManager();
ipcMain.on("start-download", async (event, { orderitemid, file }) => {
  const parsedUrl = parseURL(store.get("homeUrl"), true);
  indieDownloadManager.downloadFile({
    downloadItemId: orderitemid,
    downloadUrl:
      parsedUrl.protocol + "//" + parsedUrl.host + file.itemdownloadurl,
    onStarted: () => {
      mainWindow.webContents.send(`download-started-${orderitemid}`);
    },
    onCancel: () => {
      mainWindow.webContents.send(`download-abort-${orderitemid}`);
    },
    onProgress: ({ transferredBytes, totalBytes }) => {
      mainWindow.webContents.send(`download-progress-${orderitemid}`, {
        loaded: transferredBytes,
        total: totalBytes,
      });
    },
    onCompleted: (filePath) => {
      mainWindow.webContents.send(`download-finished-${orderitemid}`, filePath);
      console.log("Download Complete: " + filePath);
    },
    onError: (err) => {
      mainWindow.webContents.send(`download-error-${orderitemid}`, err);
    },
    openFolderWhenDone: true,
  });
});

ipcMain.on("onOpenFile", (_, path) => {
  let downloadpath = app.getPath("downloads");
  openFile(path.join(downloadpath, path.itemexportname));
});

ipcMain.on("readDir", (_, { path }) => {
  const files = readDirectory(path); // Call the function to read the directory

  //onScan(files)
  console.log("Received files from main process:", files);
});

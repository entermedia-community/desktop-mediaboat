process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

const axios = require("axios");
const chokidar = require("chokidar");
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
	nativeImage,
	clipboard,
} = require("electron");
const electronLog = require("electron-log");
const Store = require("electron-store");
const { download: eDownload, CancelError } = require("electron-dl");
const { EventEmitter } = require("events");
const FormData = require("form-data");
const fs = require("fs");
const mime = require("mime-types");
const OS = require("os");
const path = require("node:path");
const rp = require("request-promise");
const { parse: parseURL } = require("node:url");
const qs = require("node:querystring");
const demos = require("./assets/demos.json");

require("dotenv").config();
electronLog.initialize();
electronLog.transports.console.level = "debug";
electronLog.transports.console.format = "│{h}:{i}:{s}.{ms}│ {text}";
const isDev = process.env.NODE_ENV === "development";
const computerName = OS.userInfo().username + OS.hostname();

let defaultWorkDirectory = path.join(app.getPath("home"), "eMedia" + path.sep);
let currentWorkDirectory = defaultWorkDirectory;
let connectionOptions = {
	headers: { "X-computername": computerName },
};

let mainWindow;
let loaderWindow;
let entermediaKey;

const store = new Store();
const appIcon = nativeImage.createFromPath(
	path.join(__dirname, "../images/icon.png")
);
const trayIcon = nativeImage.createFromPath(
	path.join(
		__dirname,
		`assets/images/em${process.platform === "darwin" ? "" : "s"}.png`
	)
);
const loaderPage = `file://${__dirname}/loader.html`;
const configPage = `file://${__dirname}/welcome.html`;

const currentVersion = app.getVersion();

function log(...args) {
	console.log("\n┌────────────┐");
	electronLog.debug(...args);
	console.log("└────────────┘\n");
	if (mainWindow) {
		mainWindow.webContents.send("electron-log", args);
	}
}

function error(...args) {
	console.log("\n\x1b[31m┌────────────┐\x1b[0m");
	electronLog.error(...args);
	console.log("\x1b[31m└────────────┘\x1b[0m\n");
	if (mainWindow) {
		mainWindow.webContents.send("electron-error", args);
	}
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
		icon: appIcon,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: true,
			nodeIntegrationInWorker: false,
			contextIsolation: false,
			enableRemoteModule: true,
		},
		vibrancy: "fullscreen-ui",
		backgroundMaterial: "acrylic",
	});

	mainWindow.setVisibleOnAllWorkspaces(true);

	mainWindow.on("move", saveBounds);
	mainWindow.on("resize", saveBounds);

	mainWindow.on("close", (event) => {
		if (app.isQuitting) return false;
		event.preventDefault();
		mainWindow.hide();
	});

	const homeUrl = store.get("homeUrl");
	const localDrive = store.get("localDrive");
	app.allowRendererProcessReuse = false;
	if (!homeUrl || !localDrive) {
		openConfigPage();
	} else {
		currentWorkDirectory = localDrive;
		openWorkspace(homeUrl);
	}
	// Open the DevTools.
	if (isDev) {
		mainWindow.webContents.openDevTools();
	}

	setMainMenu();
	createTray();
	createContextMenu();
};

function createContextMenu() {
	mainWindow.webContents.on("context-menu", (_event, props) => {
		const { editFlags, linkURL } = props;
		const template = [
			{
				id: "refresh",
				label: "Refresh",
				enabled: true,
				click() {
					mainWindow.webContents.reload();
				},
			},
			{
				id: "copyLink",
				label: "Copy Link Address",
				visible: !!linkURL && linkURL !== "#",
				click() {
					clipboard.writeText(linkURL);
				},
			},
			{
				type: "separator",
			},
			{
				id: "cut",
				label: "Cut",
				role: process.platform === "darwin" ? undefined : "cut",
				enabled: editFlags.canCut,
				click() {
					mainWindow.webContents.cut();
				},
			},
			{
				id: "copy",
				label: "Copy",
				role: process.platform === "darwin" ? undefined : "copy",
				enabled: editFlags.canCopy,
				click() {
					mainWindow.webContents.copy();
				},
			},
			{
				id: "paste",
				label: "Paste",
				role: process.platform === "darwin" ? undefined : "paste",
				enabled: editFlags.canPaste,
				click() {
					mainWindow.webContents.paste();
				},
			},
			{
				id: "selectall",
				label: "Select All",
				role: "selectall",
				enabled: editFlags.canSelectAll,
			},
			{
				type: "separator",
			},
			{
				id: "inspect",
				label: "Inspect Element",
				visible: isDev,
				click() {
					mainWindow.webContents.inspectElement(props.x, props.y);
				},
			},
		];

		const menu = Menu.buildFromTemplate(template);
		menu.popup({});
	});
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	app.exit(0);
} else {
	app.on("second-instance", (event, commandLine, workingDirectory) => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}
	});

	app.whenReady().then(() => {
		createWindow();
		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				createWindow();
			} else {
				showApp();
			}
		});
	});
}

if (process.defaultApp) {
	if (process.argv.length >= 2) {
		app.setAsDefaultProtocolClient("emedia", process.execPath, [
			path.resolve(process.argv[1]),
		]);
	}
} else {
	app.setAsDefaultProtocolClient("emedia");
}

app.on("open-url", (_, url) => {
	const parsedUrl = parseURL(url);
	const query = qs.parse(parsedUrl.query);
	if (query.page === "config") {
		openConfigPage();
	} else if (query.url) {
		log(query.url);
		openWorkspace(query.url);
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.exit(0);
	}
});

app.on("before-quit", () => {
	if (autoFolderWatcher) {
		autoFolderWatcher.close();
	}
	saveBounds(true);
	mainWindow.removeAllListeners("close");
	mainWindow.destroy();
});

let saveBoundTimeout;
function saveBounds(immediate = false) {
	clearTimeout(saveBoundTimeout);
	if (immediate) {
		const bounds = mainWindow.getBounds();
		store.set("lastBounds", bounds);
		return;
	}
	saveBoundTimeout = setTimeout(() => {
		const bounds = mainWindow.getBounds();
		log("Saving bounds to store: ", bounds);
		store.set("lastBounds", bounds);
	}, 1000);
}

function showApp(reload = false) {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
			mainWindow.focus();
		}
		mainWindow.show();
		if (reload) {
			const homeUrl = store.get("homeUrl");
			mainWindow.loadURL(homeUrl);
		}
	}
}

function createTray() {
	const trayMenu = [];
	trayMenu.push({
		label: "Show App",
		click: () => {
			showApp();
		},
	});
	trayMenu.push({ type: "separator" });
	trayMenu.push({
		label: "Home",
		click: () => {
			showApp(true);
		},
	});
	trayMenu.push({
		label: "Libraries Settings",
		click() {
			openConfigPage();
		},
	});
	trayMenu.push({ type: "separator" });
	trayMenu.push({
		label: "Exit",
		click: () => {
			app.isQuitting = true;
			app.quit();
		},
	});
	const tray = new Tray(trayIcon);
	tray.setToolTip("eMedia Library");
	const contextMenu = Menu.buildFromTemplate(trayMenu);
	tray.setContextMenu(contextMenu);

	const dockMenu = Menu.buildFromTemplate([
		trayMenu[1],
		{ ...trayMenu[3], label: "Configure Libraries" },
	]);
	app.dock.setMenu(dockMenu);
}

function openConfigPage() {
	mainWindow.loadURL(configPage);
}

ipcMain.on("configInit", () => {
	const welcomeDone = store.get("welcomeDone");
	const workspaces = store.get("workspaces");
	const homeUrl = store.get("homeUrl");
	mainWindow.webContents.send("config-init", {
		welcomeDone: welcomeDone,
		workspaces,
		currentUrl: homeUrl,
	});
	setMainMenu();
});

ipcMain.on("welcomeDone", () => {
	store.set("welcomeDone", true);
});

ipcMain.on("upsertWorkspace", (_, newWorkspace) => {
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
	setMainMenu();
});

ipcMain.on("deleteWorkspace", (_, url) => {
	let workspaces = store.get("workspaces") || [];
	workspaces = workspaces.filter((w) => w.url !== url);
	store.set("workspaces", workspaces);
	const homeUrl = store.get("homeUrl");
	if (homeUrl === url) {
		store.delete("homeUrl");
	}
	setMainMenu();
});

function showLoader() {
	const bounds = mainWindow.getBounds();
	const contentSize = mainWindow.getContentSize();
	bounds.y += bounds.height - contentSize[1];
	bounds.height = contentSize[1];

	if (loaderWindow) {
		loaderWindow.destroy();
	}
	loaderWindow = new BrowserWindow({
		...bounds,
		parent: mainWindow,
		resizable: false,
		frame: false,
		transparent: true,
		backgroundColor: "rgba(255, 255, 255, 0.25)",
		vibrancy: "fullscreen-ui",
		backgroundMaterial: "acrylic",
	});
	loaderWindow.loadURL(loaderPage);
	loaderWindow.show();
}

function openWorkspace(homeUrl) {
	log("Opening Workspace: ", homeUrl);

	let userAgent = mainWindow.webContents.getUserAgent();
	if (userAgent.indexOf("ComputerName") === -1) {
		userAgent = userAgent + "eMediaLibrary/2.5.5 ComputerName/" + computerName;
	}

	showLoader();

	mainWindow.loadURL(homeUrl, { userAgent });
	mainWindow.webContents.on("did-finish-load", () => {
		mainWindow.webContents.send("set-local-root", currentWorkDirectory);
		if (loaderWindow) loaderWindow.destroy();
	});
	mainWindow.webContents.on("did-navigate-in-page", () => {
		setMainMenu();
	});

	setMainMenu();
}

ipcMain.on("getExternalSyncEnabled", () => {
	const externalSyncEnabled = store.get("externalSyncEnabled");
	mainWindow.webContents.send("set-external-sync", externalSyncEnabled);
});

ipcMain.on("changeLocalDrive", (_, { selectedPath, externalSyncEnabled }) => {
	if (fs.existsSync(selectedPath)) {
		const currentHome = store.get("homeUrl");
		let workspaces = store.get("workspaces") || [];
		workspaces = workspaces.map((w) => {
			if (w.url === currentHome) {
				w.drive = selectedPath;
			}
			return w;
		});
		store.set("workspaces", workspaces);
		store.set("localDrive", selectedPath);
		if (externalSyncEnabled) {
			store.set("externalSyncEnabled", true);
		} else {
			store.delete("externalSyncEnabled");
		}
		currentWorkDirectory = selectedPath;
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

function parsePath(p) {
	return p.replaceAll(path.sep, path.posix.sep);
}

let autoFolderWatcher;
const watchedAutoFolders = [];
async function StartWatcher(workPath) {
	if (!fs.existsSync(workPath)) {
		return;
	}
	if (!autoFolderWatcher) {
		autoFolderWatcher = chokidar.watch(workPath, {
			ignored: [/\.DS_Store/, /Thumbs\.db/],
			persistent: true,
			ignoreInitial: true,
			followSymlinks: false,
		});
		autoFolderWatcher
			.on("add", (p) => {
				mainWindow.webContents.send("auto-file-added", p);
			})
			.on("error", (err) => {
				log("Chokidar error:", err);
			})
			.on("ready", () => {
				log("Watching for changes on", workPath);
			});
	} else {
		autoFolderWatcher.add(workPath);
	}

	watchedAutoFolders.push(workPath);
}

let entityWatcher;
const watchedEntities = [];
ipcMain.on("watchFolder", (_, folder) => {
	if (!folder.id || !folder.path) return;
	const existing = watchedEntities.some((f) => f.id === folder.id);
	if (existing) return;
	if (watchedEntities.length + 1 > 10) {
		const toRemove = watchedEntities.shift();
		if (entityWatcher && toRemove) {
			entityWatcher.unwatch(toRemove.path);
		}
	}

	watchedEntities.push(folder);

	const folderFullPath = path.join(currentWorkDirectory, folder.path);

	if (!fs.existsSync(folderFullPath)) {
		return;
	}

	if (!entityWatcher) {
		entityWatcher = chokidar.watch(folderFullPath, {
			ignored: /^\./,
			persistent: true,
			ignoreInitial: true,
			followSymlinks: false,
		});
		entityWatcher.on("add", (p) => {
			const filePath = p.replace(currentWorkDirectory, "");
			const catPath = path.dirname(filePath);
			mainWindow.webContents.send("file-added", parsePath(catPath));
		});
		entityWatcher.on("unlink", (p) => {
			const filePath = p.replace(currentWorkDirectory, "");
			const catPath = path.dirname(filePath);
			mainWindow.webContents.send("file-removed", parsePath(catPath));
		});
		entityWatcher.on("unlinkDir", (p) => {
			const filePath = p.replace(currentWorkDirectory, "");
			const catPath = path.dirname(filePath);
			mainWindow.webContents.send("file-removed", parsePath(catPath));
		});
	} else {
		entityWatcher.add(folderFullPath);
	}
});

function getMediaDbUrl(url) {
	const mediaDbUrl = store.get("mediadburl");
	if (!mediaDbUrl) {
		error("No MediaDB url found");
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
		assetId,
		onStarted,
		onCancel,
		onProgress,
		onCompleted,
		onError,
	}) {
		if (this.isCancelled) {
			log("Cancelled uploading");
			return;
		}
		log("Uploading: ", filePath);
		const uploadPromise = this.createUploadPromise(
			subFolderId,
			{ sourcePath, filePath, assetId },
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
						sourcepath: formData.sourcePath.replaceAll(
							path.sep,
							path.posix.sep
						),
						filesize: size,
						id: formData.assetId || "",
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
				} catch (err) {
					if (typeof callbacks.onError === "function") {
						log(err);
						callbacks.onError(
							subFolderId,
							err.message || JSON.stringify(err) || "Unknown error"
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
			const ext = path.extname(item).toLowerCase();
			if (item.startsWith(".") || ext === ".ini" || ext === ".db") return;
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
		const ext = path.extname(file).toLowerCase();
		if (file.startsWith(".") || ext === ".ini" || ext === ".db") return;
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
							assetId: item.id,
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
			error("Error on upload/AutoFolders: " + category.path);
			error(err);
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

let subfolders = [];
ipcMain.on("syncAutoFolders", (_, syncFolders) => {
	subfolders = [];
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
});

ipcMain.on("startAutoFoldersUpload", (_) => {
	uploadAutoFolders(subfolders);
});

ipcMain.on("cancelAutoUpload", () => {
	autoUploadManager.cancelAllUpload();
	mainWindow.webContents.send("upload-canceled");
});

ipcMain.on("abortUpload", () => {
	entityUploadManager.cancelAllUpload();
});
const dropUploadManager = new UploadManager();
const dropUploadCounter = new UploadCounter();
ipcMain.on("filesDropped", (_, { data, files }) => {
	// dropUploadCounter.setTotal(files.length);
	const categoryPath = data.categorypath;
	const entityId = data.entityid;
	log("filesDropped", files, categoryPath, entityId);

	let filePaths = [];
	files.forEach((filePath) => {
		if (!fs.existsSync(filePath)) {
			return;
		}
		const stats = fs.statSync(filePath);
		console.log(stats.isDirectory());
		if (stats.isDirectory()) {
			console.log(getAllFiles(filePath));
			filePaths = filePaths.concat(getAllFiles(filePath));
		} else {
			filePaths.push(filePath);
		}
	});
	log("filePaths", filePaths);
	// files.forEach((filePath) => {
	// 	dropUploadManager.uploadFile({
	// 		subFolderId: data.categoryid,
	// 		filePath: filePath,
	// 	});
	// });
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

	if (!drive.endsWith(path.sep)) {
		drive += path.sep;
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
		label: "Library Settings",
		click() {
			openConfigPage();
		},
	});
	return subMenus;
}

function setMainMenu() {
	if (!mainWindow) return;
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
					label: "Settings",
					accelerator: "CmdOrCtrl+,",
					click: () => {
						openConfigPage();
					},
				},
				{
					type: "separator",
				},
				{
					label: "Exit",
					accelerator: "CmdOrCtrl+Q",
					click() {
						app.isQuitting = true;
						app.quit();
					},
				},
			],
		},
		{
			label: "Edit",
			role: "editMenu",
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
					label: "Back",
					accelerator: "CmdOrCtrl+Left",
					click() {
						mainWindow.webContents.navigationHistory.goBack();
					},
					enabled: mainWindow.webContents.navigationHistory.canGoBack(),
				},
				{
					label: "Refresh",
					accelerator: "CmdOrCtrl+R",
					click() {
						showLoader();
						mainWindow.reload();
					},
				},
				{
					label: "Refresh (Legacy)",
					accelerator: "F5",
					click() {
						showLoader();
						mainWindow.reload();
					},
					visible: false,
					acceleratorWorksWhenHidden: true,
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
				{
					label: "Copy Current URL",
					accelerator: "CmdOrCtrl+Shift+C",
					click() {
						const url = mainWindow.webContents.getURL();
						if (url) {
							clipboard.writeText(url);
						}
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
			role: "help",
			submenu: [
				{
					label: "About",
					click() {
						dialog
							.showMessageBox(mainWindow, {
								type: "info",
								icon: appIcon,
								buttons: ["Show Log", "Close"],
								defaultId: 0,
								cancelId: 1,
								title: "Version",
								message: "eMedia Library v" + currentVersion,
							})
							.then(({ response }) => {
								if (response === 0) {
									const logFile = electronLog.transports.file.getFile();
									openFolder(path.dirname(logFile.path));
								}
							});
					},
				},
			],
		},
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.on("uploadFolder", (event, options) => {
	log("uploadFolder called", options);
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
				startFolderUpload(directory, inSourcepath, inMediadbUrl, options);
			}
		})
		.catch((err) => {
			error(err);
		});
});

function startFolderUpload(
	startingdirectory,
	inSourcepath,
	inMediadbUrl,
	options
) {
	let dirname = path.basename(startingdirectory);

	let form1 = new FormData();

	if (options["moduleid"] != null && options["entityid"] != null) {
		form1.append("moduleid", options["moduleid"]);
		form1.append("entityid", options["entityid"]);
	}

	let savingPath = path.join(inSourcepath, dirname);
	log("Upload start to category:" + savingPath);
	form1.append("absPath", savingPath);
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
	log("Submitting Form: " + formurl);

	fetch(formurl, {
		method: "POST",
		body: form,
		useSessionCookie: true,
		headers: { "X-tokentype": "entermedia", "X-token": entermediaKey },
	})
		.then(function (res) {
			log("Form Submitted");
			if (typeof formCompleted === "function") {
				formCompleted();
			}
		})
		.catch((err) => {
			error(err);
		});
}

function runJavaScript(code) {
	log("Executed: " + code);
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
				log("Subdirectory found: " + filepath);
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

			filepath = path.basename(filepath);

			filepath = filepath.replace(":", "");
			let filenamefinal = filepath.replace(currentWorkDirectory, ""); //remove user home
			let absPath = path.join(savingPath, filenamefinal);
			absPath = absPath.split(path.sep).join(path.posix.sep);

			let form = new FormData();
			form.append("absPath", absPath);
			form.append("file", filestream);
			log("Uploading: " + absPath);
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
	log("Opening: " + path);
	try {
		if (!fs.existsSync(path)) {
			error("File not found: " + path);
			return;
		}
		shell.openPath(path).then((err) => {
			if (err) {
				error(err);
			}
		});
	} catch (e) {
		error("Failed to open the file: " + path);
	}
}

function readDirectory(directory, append = false) {
	let filePaths = [];
	let folderPaths = [];
	let files = fs.readdirSync(directory);
	files.forEach((file) => {
		const ext = path.extname(file).toLowerCase();
		if (file.startsWith(".") || ext === ".ini" || ext === ".db") return;
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

function getAllFiles(rootDirectory) {
	if (!fs.existsSync(rootDirectory)) {
		log("Directory not found: " + rootDirectory);
		return [];
	}
	let filePaths = [];
	function searchFiles(directory) {
		let files = fs.readdirSync(directory);
		files.forEach((file) => {
			if (file.startsWith(".")) return;
			let filepath = path.join(directory, file);
			console.log(filepath);
			let stats = fs.statSync(filepath);
			if (stats.isDirectory()) {
				searchFiles(filepath);
			} else {
				filePaths.push(filepath);
			}
		});
	}
	searchFiles(rootDirectory);
	return filePaths;
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
			const ext = path.extname(file).toLowerCase();
			if (file.startsWith(".") || ext === ".ini" || ext === ".db") return;
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
		const level = lp.level;
		const parent = lp.path.split("/").slice(0, -1).join("/");
		const categoryIndex = categories.findIndex(
			(c) => parseInt(c.level) === level - 1 && c.path === parent
		);
		categories.splice(categoryIndex + 1, 0, {
			name: path.basename(lp.path),
			level: level,
			path: lp.path,
			isExtra: true,
		});
	});
	const newCategories = categories.map((c, i) => {
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
	categorypath,
	callback,
	args = null,
	ignoreExtra = false
) {
	if (!categorypath) return;
	log("Fetching from: " + categorypath);
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
						const dir = path.join(currentWorkDirectory, categories[0].path);
						if (!fs.existsSync(dir)) {
							fs.mkdirSync(dir, { recursive: true });
						}
					}
					if (!ignoreExtra) {
						addExtraFoldersToList(categories, categorypath);
					}
					if (args) {
						callback(categories, 0, args);
					} else {
						callback(categories);
					}
				}
			}
		})
		.catch(function (err) {
			error("Error loading: " + url);
			error(err);
		});
}

ipcMain.on("downloadAll", (_, categorypath) => {
	fetchSubFolderContent(
		categorypath,
		downloadFilesRecursive,
		{ topCat: categorypath },
		true
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
			error("Error on scan Folder: " + category.path);
			error(err);
		});
}

ipcMain.on("scanAll", (_, categorypath) => {
	fetchSubFolderContent(categorypath, scanFilesRecursive);
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
			error("Invalid downloadItemId");
			return;
		}
		if (!downloadUrl) {
			error("Invalid downloadUrl");
			return;
		}
		if (directory !== undefined) {
			if (!fs.existsSync(directory)) {
				try {
					fs.mkdirSync(directory, { recursive: true });
				} catch (e) {
					error(directory + " doesn't exist");
					return;
				}
			}
		}
		if (this.isCancelled) {
			log("Cancelled downloading");
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
				log("Downloading: " + downloadUrl);
				log("Save dest: " + directory);
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
					log("Error downloading " + downloadUrl);
					log(e.message || e);
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
const currentDownloadProgress = {};
async function downloadFilesRecursive(categories, index = 0, options = {}) {
	if (categories.length === index) {
		log("Batch download complete");
		mainWindow.webContents.send("download-batch-complete", options);
		batchDownloadCounter.removeAllListeners("completed");
		delete currentDownloadProgress[options.topCat];
		return;
	}

	if (!currentDownloadProgress[options.topCat]) {
		currentDownloadProgress[options.topCat] = 0;
	}

	batchDownloadCounter.once("completed", async () => {
		await downloadFilesRecursive(categories, index + 1, options);
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
										transferredBytes:
											currentDownloadProgress[options.topCat] +
											transferredBytes,
										totalBytes,
										...options,
									});
								}
							},
							onCompleted: ({ fileSize }) => {
								currentDownloadProgress[options.topCat] += fileSize;
								mainWindow.webContents.send("download-batch-next", {
									categoryPath: category.path,
									assetId,
									...options,
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
			error("Error on download Folder: " + category.path);
			error(err);
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

ipcMain.on("openFile", (_, options) => {
	if (
		!options["path"].startsWith("/") &&
		!options["path"].match(/^[a-zA-Z]:/)
	) {
		options["path"] = path.join(currentWorkDirectory, options["path"]);
	}
	openFile(options["path"]);
});

ipcMain.on(
	"openFileWithDefault",
	(_, { categorypath, filename, dlink, lightbox, useexternalsync = false }) => {
		const filePath = path.join(currentWorkDirectory, categorypath, filename);
		if (lightbox) {
			mainWindow.webContents.send("show-sync-lightbox", {
				lightbox,
			});
		}
		if (fs.existsSync(filePath)) {
			openFile(filePath);
		} else {
			if (useexternalsync) {
				return;
			}
			if (!dlink.startsWith("http:")) {
				const parsedUrl = parseURL(store.get("homeUrl"), true);
				dlink = parsedUrl.protocol + "//" + parsedUrl.host + dlink;
			}
			log("File doesn't exist. Downloading from: " + dlink);
			eDownload(mainWindow, dlink, {
				directory: path.dirname(filePath),
				onCompleted: () => {
					openFile(filePath);
				},
				onCancel: () => {
					error("Download cancelled");
				},
			});
		}
	}
);

ipcMain.on("openFolder", (_, options) => {
	if (
		!options["path"].startsWith("/") &&
		!options["path"].match(/^[a-zA-Z]:/)
	) {
		options["path"] = path.join(currentWorkDirectory, options["path"]);
	}
	openFolder(options["path"]);
});

function openFolder(path) {
	log("Opening folder: " + path);
	if (path.match(/[$.{}]/g)) {
		error("Invalid path: " + path);
		return;
	}

	try {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path, { recursive: true }, (err) => {
				if (err) error(err);
			});
			shell.openPath(path);
		} else {
			shell.openPath(path);
		}
	} catch (e) {
		error("Error reading directory: " + path);
	}
}

ipcMain.on(
	"shouldInternalSyncLightboxShow",
	(_, { uploadsourcepath, lightbox, useexternalsync = false }) => {
		let categoryPath;
		if (!lightbox) {
			categoryPath = path.join(currentWorkDirectory, uploadsourcepath);
		} else {
			categoryPath = path.join(
				currentWorkDirectory,
				uploadsourcepath,
				lightbox
			);
		}
		const externalSyncEnabled = store.get("externalSyncEnabled");
		if (externalSyncEnabled && useexternalsync) {
			return;
		}
		if (fs.existsSync(categoryPath)) {
			mainWindow.webContents.send("show-sync-lightbox", {
				lightbox,
			});
		}
	}
);
ipcMain.on(
	"internalSyncLightboxDown",
	(_, { uploadsourcepath, lightbox, useexternalsync = false }) => {
		let categoryPath;
		if (!lightbox) {
			categoryPath = uploadsourcepath;
		} else {
			categoryPath = path.join(uploadsourcepath, lightbox);
		}
		openFolder(path.join(currentWorkDirectory, categoryPath));
		const externalSyncEnabled = store.get("externalSyncEnabled");
		if (externalSyncEnabled && useexternalsync) {
			mainWindow.webContents.send("internal-lightbox-sync-disabled", {
				lightbox,
			});
			return;
		} else {
			mainWindow.webContents.send("lightbox-downloading", { lightbox });
		}
		log("Syncing: " + categoryPath);
		fetchSubFolderContent(
			categoryPath,
			downloadFilesRecursive,
			{ topCat: categoryPath, lightbox: true },
			true
		);
	}
);

ipcMain.on(
	"internalSyncLightboxUp",
	(_, { uploadsourcepath, lightbox, entityId }) => {
		let categoryPath;
		if (!lightbox) {
			categoryPath = uploadsourcepath;
		} else {
			categoryPath = path.join(uploadsourcepath, lightbox);
		}
		fetchSubFolderContent(categoryPath, uploadFilesRecursive, {
			entityId,
			lightbox: true,
		});
	}
);

ipcMain.on("uploadAll", async (_, { categorypath, entityId }) => {
	fetchSubFolderContent(categorypath, uploadFilesRecursive, {
		entityId: entityId,
	});
});

const entityUploadCounter = new UploadCounter();
const entityUploadManager = new UploadManager();

let lastEntityProgUpdate = 0;
async function uploadFilesRecursive(categories, index = 0, options = {}) {
	if (categories.length === index) {
		mainWindow.webContents.send("entity-upload-complete", options);
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
							assetId: item.id,
							sourcePath: path.join(category.path, item.path),
							onProgress: ({ id, loaded }) => {
								if (lastEntityProgUpdate + 1000 < Date.now()) {
									lastEntityProgUpdate = Date.now();
									mainWindow.webContents.send("entity-upload-progress", {
										id,
										index: category.index,
										loaded,
										...options,
									});
								}
							},
							onCompleted: () => {
								const f = fs.statSync(filePath);
								mainWindow.webContents.send("entity-upload-next", {
									id: options["entityId"],
									index: category.index,
									size: f.size,
									...options,
								});
								entityUploadCounter.incrementCompleted();
							},
							onError: (id, err) => {
								entityUploadCounter.incrementCompleted();
								mainWindow.webContents.send("entity-upload-error", {
									id,
									index: category.index,
									error: err,
									...options,
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
			error("Error on upload/FilesRecursive: " + category.path);
			error(err);
		});
}

ipcMain.on("trashExtraFiles", async (_, { categorypath }) => {
	fetchSubFolderContent(categorypath, trashFilesRecursive);
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
			error("Error on trashFilesRecursive: " + category.path);
			error(err);
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
			log("Download Complete: " + filePath);
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
	log("Received files from main process:", files);
});

ipcMain.on("directDownload", (_, url) => {
	mainWindow.webContents.downloadURL(url);
});

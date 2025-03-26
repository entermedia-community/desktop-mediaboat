process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

const axios = require("axios");
const {
	app,
	BrowserWindow,
	ipcMain,
	dialog,
	Menu,
	Tray,
	shell,
	session,
	nativeImage,
	clipboard,
} = require("electron");
const Store = require("electron-store");
const FormData = require("form-data");
const electronLog = require("electron-log");
const { download: eDownload, CancelError } = require("electron-dl");
const fs = require("fs");
const mime = require("mime-types");
const OS = require("os");
const path = require("node:path");
const { parse: parseURL } = require("node:url");
const qs = require("node:querystring");
const { got } = require("got-cjs");
const { it } = require("node:test");

require("dotenv").config();
electronLog.initialize();
electronLog.transports.console.level = "debug";
electronLog.transports.console.format = "│{h}:{i}:{s}.{ms}│ {text}";
const isDev = process.env.NODE_ENV === "development";
const computerName = OS.userInfo().username + OS.hostname();

let defaultWorkDirectory = path.join(app.getPath("home"), "eMedia" + path.sep);
let defaultDownloadDirectory = app.getPath("downloads");

let currentWorkDirectory = defaultWorkDirectory;
let currentDownloadDirectory = defaultDownloadDirectory;

let connectionOptions = {
	headers: { "X-computername": computerName },
};

let mainWindow = null;
let loaderWindow = null;
// let loaderTimeout;

let tray = null;

const store = new Store();
const appIcon = nativeImage.createFromPath(
	path.join(__dirname, "../images/icon.png")
);

const currentVersion = app.getVersion();

function log(...args) {
	try {
		console.log("\n┌────────────┐");
		electronLog.debug(...args);
		console.log("└────────────┘\n");
	} catch (e) {
		console.error(e);
	} finally {
		if (mainWindow) {
			mainWindow.webContents.send("electron-log", args);
		}
	}
}

function error(...args) {
	try {
		console.log("\n\x1b[31m┌────────────┐\x1b[0m");
		electronLog.error(...args);
		console.log("\x1b[31m└────────────┘\x1b[0m\n");
	} catch (e) {
		console.error(e);
	} finally {
		if (mainWindow) {
			mainWindow.webContents.send("electron-error", args);
		}
	}
}

const createWindow = () => {
	mainWindow = new BrowserWindow({
		icon: appIcon,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: true,
			nodeIntegrationInWorker: false,
			contextIsolation: false,
			enableRemoteModule: true,
		},
		show: false,
	});

	mainWindow.once("ready-to-show", () => {
		hideLoader();
		mainWindow.maximize();
		mainWindow.setVisibleOnAllWorkspaces(true);
	});

	mainWindow.on("close", (event) => {
		if (app.isQuitting) return false;
		event.preventDefault();
		mainWindow.hide();
	});

	const homeUrl = store.get("homeUrl");
	const localDrive = store.get("localDrive");
	const localDownload = store.get("localDownload");
	if (localDownload) {
		currentDownloadDirectory = localDownload;
	}
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

	mainWindow.webContents.on("did-finish-load", () => {
		hideLoader();
		mainWindow.webContents.send("set-local-root", currentWorkDirectory);
	});
	mainWindow.webContents.on("did-stop-loading", () => {
		hideLoader();
	});
	mainWindow.webContents.on("did-navigate-in-page", () => {
		setMainMenu();
	});
	session.defaultSession.on("will-download", async (e, item) => {
		// e.preventDefault();
		const filename = item.getFilename();
		item.setSavePath(path.join(currentDownloadDirectory, filename));
		item.once("done", () => {
			openFolder(currentDownloadDirectory);
		});

		// console.log("Downloading: ", item.getURL());
		// const url = item.getURL();
		// const total = item.getTotalBytes();
		// const id = "d-" + Date.now();
		// let lastProgressUpdate = 0;

		// try {
		// 	await eDownload(mainWindow, url, {
		// 		directory: currentDownloadDirectory,
		// 		onStarted: () => {
		// 			mainWindow.webContents.send("download-update", {
		// 				id,
		// 				status: "started",
		// 				percent: 0,
		// 				loaded: 0,
		// 				total,
		// 			});
		// 		},
		// 		onProgress: (progress) => {
		// 			if (Date.now() - lastProgressUpdate < 500) return;
		// 			lastProgressUpdate = Date.now();
		// 			mainWindow.webContents.send("download-update", {
		// 				id,
		// 				status: "progress",
		// 				loaded: progress.transferredBytes,
		// 				total,
		// 				percent: progress.percent,
		// 			});
		// 		},
		// 		onCompleted: () => {
		// 			mainWindow.webContents.send("download-update", {
		// 				id,
		// 				status: "completed",
		// 				percent: 100,
		// 				loaded: total,
		// 				total,
		// 			});
		// 		},
		// 		onError: (error) => {
		// 			mainWindow.webContents.send("download-update", {
		// 				id,
		// 				status: "error",
		// 				error,
		// 			});
		// 		},
		// 		openFolderWhenDone: true,
		// 		overwrite: true,
		// 		saveAs: false,
		// 		showBadge: true,
		// 		showProgressBar: true,
		// 	});
		// } catch (e) {
		// 	mainWindow.webContents.send("download-update", {
		// 		id,
		// 		status: "error",
		// 		error: e,
		// 	});
		// }
	});

	setMainMenu();
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
					showLoader();
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
		createTray();
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
	mainWindow.removeAllListeners("close");
	mainWindow.destroy();
});

function showApp(reload = false) {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
			mainWindow.focus();
		}
		mainWindow.show();
		if (reload) {
			const homeUrl = store.get("homeUrl");
			openWorkspace(homeUrl);
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
	const trayIcon = nativeImage.createFromPath(
		path.join(__dirname, `assets/images/ems.png`)
	);
	tray = new Tray(trayIcon);
	tray.setToolTip("eMedia Library");
	const contextMenu = Menu.buildFromTemplate(trayMenu);
	tray.setContextMenu(contextMenu);

	if (process.platform === "darwin") {
		const dockMenu = Menu.buildFromTemplate([
			trayMenu[1],
			{ ...trayMenu[3], label: "Settings" },
		]);
		app.dock.setMenu(dockMenu);
	}
}

function openConfigPage() {
	mainWindow.loadFile(path.join(__dirname, "welcome.html"));
}

ipcMain.on("configInit", () => {
	const workspaces = store.get("workspaces") || [];
	const currentUrl = store.get("homeUrl");
	mainWindow.webContents.send("config-init", {
		workspaces,
		currentUrl,
	});
	setMainMenu();
});

ipcMain.handle("connection-established", async (_, options) => {
	hideLoader();
	try {
		let homeUrl = await store.get("homeUrl");
		if (homeUrl) {
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
		}
	} catch (error) {
		log(error);
	} finally {
		connectionOptions = {
			...options,
			headers: {
				...options.headers,
				"X-computername": computerName,
			},
		};
		store.set("mediadburl", options.mediadb);
	}

	return {
		computerName,
		rootPath: currentWorkDirectory,
		downloadPath: currentDownloadDirectory,
	};
});

ipcMain.on("upsertWorkspace", (_, newWorkspace) => {
	let workspaces = store.get("workspaces") || [];
	workspaces = workspaces.filter((w) => w.url);
	let drive = defaultWorkDirectory;
	const currentIdx = newWorkspace.prevUrl
		? workspaces.findIndex((w) => w.url === newWorkspace.prevUrl)
		: -1;
	delete newWorkspace.prevUrl;
	if (currentIdx === -1) {
		newWorkspace.drive = drive;
		workspaces.push(newWorkspace);
	} else {
		drive = workspaces[currentIdx].drive;
		workspaces[currentIdx] = {
			...workspaces[currentIdx],
			...newWorkspace,
			drive,
		};
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
	hideLoader(function () {
		loaderWindow = new BrowserWindow({
			width: 400,
			height: 400,
			alwaysOnTop: true,
			resizable: false,
			frame: false,
			movable: false,
			show: false,
			hasShadow: false,
		});

		loaderWindow.loadFile(path.join(__dirname, "loader.html"));
		loaderWindow.once("ready-to-show", () => {
			loaderWindow.show();
		});
		// loaderTimeout = setTimeout(() => {
		// 	loaderWindow.destroy();
		// 	loaderWindow = null;
		// }, 4000);
	});
}

function hideLoader(cb = null) {
	// if (loaderTimeout) {
	// 	clearTimeout(loaderTimeout);
	// }
	if (loaderWindow) {
		loaderWindow.destroy();
		loaderWindow = null;
	}
	if (cb) cb();
}

function openWorkspace(homeUrl) {
	log("Opening Workspace: ", homeUrl);

	let userAgent = mainWindow.webContents.getUserAgent();
	if (userAgent.indexOf("ComputerName") === -1) {
		userAgent = userAgent + "eMediaLibrary/2.5.5 ComputerName/" + computerName;
	}

	showLoader();

	mainWindow.loadURL(homeUrl, { userAgent });

	setMainMenu();
}

ipcMain.on("changeDesktopSettings", (_, { rootPath, downloadPath }) => {
	if (fs.existsSync(rootPath)) {
		const currentHome = store.get("homeUrl");
		let workspaces = store.get("workspaces") || [];
		workspaces = workspaces.map((w) => {
			if (w.url === currentHome) {
				w.drive = rootPath;
			}
			return w;
		});
		store.set("workspaces", workspaces);
		store.set("localDrive", rootPath);
		currentWorkDirectory = rootPath;
	}
	if (fs.existsSync(downloadPath)) {
		store.set("localDownload", downloadPath);
		currentDownloadDirectory = downloadPath;
	}
	mainWindow.webContents.send("set-local-root", {
		rootPath: currentWorkDirectory,
		downloadPath: currentDownloadDirectory,
	});
});

function getMediaDbUrl(url) {
	const mediaDbUrl = store.get("mediadburl");
	if (!mediaDbUrl) {
		error("No MediaDB url found");
		return url;
	}
	return mediaDbUrl + "/" + url;
}

const uploadAbortControllers = {};
const cancelledUploads = {};

function clipTextMiddle(text, maxLength = 100) {
	if (text.length <= maxLength) {
		return text;
	}

	const charsPerSide = Math.floor((maxLength - 3) / 2);
	const leftSide = text.substring(0, charsPerSide);
	const rightSide = text.substring(text.length - charsPerSide);

	return leftSide + "..." + rightSide;
}

async function uploadFilesRecursive(files, identifier) {
	let currentFileIndex = 0;
	let totalFiles = files.length;
	let completedFiles = 0;
	let failedFiles = 0;

	// Function to update overall progress
	const updateOverallProgress = () => {
		mainWindow.webContents.send("sync-progress-update", {
			completed: completedFiles,
			failed: failedFiles,
			total: totalFiles,
			// remaining: totalFiles - completedFiles - failedFiles,
			// percent: Math.round(
			// 	(completedFiles / (totalFiles ? totalFiles : 1)) * 100
			// ),
			identifier,
		});
	};

	updateOverallProgress();

	// Process files one by one
	const processNextFile = async () => {
		if (cancelledUploads[identifier]) {
			delete uploadAbortControllers[identifier];
			delete cancelledUploads[identifier];
			return;
		}
		// Check if we've processed all files
		if (currentFileIndex >= totalFiles) {
			delete uploadAbortControllers[identifier];
			mainWindow.webContents.send("sync-completed", {
				success: true,
				completed: completedFiles,
				failed: failedFiles,
				total: totalFiles,
				identifier,
				remaining: Object.keys(uploadAbortControllers),
			});
			return;
		}

		// Create abort controller
		uploadAbortControllers[identifier] = new AbortController();

		const currentFile = files[currentFileIndex];
		currentFile.size = fs.statSync(currentFile.path).size;
		currentFile.mime = mime.lookup(currentFile.name);

		const fileStatusPayload = {
			index: currentFileIndex,
			name: clipTextMiddle(currentFile.name),
			size: currentFile.size,
			identifier,
		};

		// Update current file status to "uploading"
		mainWindow.webContents.send("file-status-update", {
			...fileStatusPayload,
			status: "uploading",
			progress: 0,
		});

		const jsonrequest = {
			sourcepath: currentFile.sourcePath.replaceAll(path.sep, path.posix.sep),
			filesize: currentFile.size,
			id: "",
		};

		// Create form data for this single file
		const formData = new FormData();
		formData.append("jsonrequest", JSON.stringify(jsonrequest));
		const fileStream = fs.createReadStream(currentFile.path);
		formData.append("file", fileStream, { filename: currentFile.name });

		// Debounce progress updates
		let lastProgressUpdate = 0;

		try {
			// Upload the file with progress tracking
			await got
				.post(getMediaDbUrl("services/module/asset/create"), {
					body: formData,
					headers: {
						...formData.getHeaders(),
						...connectionOptions.headers,
					},
					signal: uploadAbortControllers[identifier].signal,
				})
				.on("uploadProgress", (progress) => {
					// Send individual file progress
					if (Date.now() - lastProgressUpdate < 500) return;
					lastProgressUpdate = Date.now();
					mainWindow.webContents.send("file-progress-update", {
						...fileStatusPayload,
						loaded: progress.transferred,
						total: progress.total,
						percent: progress.percent,
					});
				});

			// Mark file as completed
			completedFiles++;
			mainWindow.webContents.send("file-status-update", {
				...fileStatusPayload,
				status: "completed",
				progress: 100,
			});
		} catch (error) {
			// Mark file as failed
			failedFiles++;
			mainWindow.webContents.send("file-status-update", {
				...fileStatusPayload,
				status: "failed",
				error: error.message,
			});

			error(`Error uploading file ${currentFile.name}:`);
		}

		// Update overall progress
		updateOverallProgress();

		// Move to next file
		currentFileIndex++;

		// Process the next file
		setTimeout(processNextFile, 1000);
	};

	// Start processing files
	processNextFile();
}

ipcMain.on("cancelSync", (_, { identifier, isDownload }) => {
	if (isDownload) {
		cancelledDownloads[identifier] = true;
		downloadAbortControllers[identifier]?.cancel?.();
		delete downloadAbortControllers[identifier];
	} else {
		cancelledUploads[identifier] = true;
		uploadAbortControllers[identifier]?.abort?.();
		delete uploadAbortControllers[identifier];
	}
	mainWindow.webContents.send("sync-cancelled", { identifier, isDownload });
});

ipcMain.on("check-sync", () => {
	mainWindow.webContents.send("check-sync", {
		up_identifiers: Object.keys(uploadAbortControllers),
		dn_identifiers: Object.keys(downloadAbortControllers),
	});
});

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
	if (!fs.existsSync(directory)) {
		log("Directory not found: " + directory);
		return { files: [] };
	}

	let filePaths = [];

	const files = fs.readdirSync(directory);
	files.forEach((file) => {
		const ext = path.extname(file).toLowerCase();
		if (file.startsWith(".") || ext === ".ini" || ext === ".db") return;
		const abspath = path.join(directory, file);
		const stats = fs.statSync(abspath);
		if (!stats.isDirectory()) {
			filePaths.push({
				path: path.basename(abspath),
				size: stats.size,
				abspath,
			});
		}
	});

	return {
		files: filePaths,
	};
}

async function uploadLightbox(folders, identifier) {
	if (!identifier) {
		log("identifier not found for upload/Lightbox");
		return;
	}
	if (folders.length === 0) {
		log("folders not found for upload/Lightbox");
		return;
	}
	const filesToUpload = [];
	const fetchFilesToUpload = async (folders, index = 0) => {
		if (index >= folders.length) return;
		const folder = folders[index];
		try {
			const fetchPath = path.join(currentWorkDirectory, folder.path);
			let data = {};
			if (fs.existsSync(fetchPath)) {
				data = getFilesByDirectory(fetchPath, true);
			} else {
				data = { files: [] };
			}
			data.categorypath = folder.path;
			const res = await axios.post(
				getMediaDbUrl("services/module/asset/entity/pullpendingfiles.json"),
				data,
				{ headers: connectionOptions.headers }
			);

			if (res.data !== undefined) {
				if (typeof res.data === "string") {
					res.data = JSON.parse(res.data);
				}
				const ftu = res.data.filestoupload;
				if (ftu !== undefined) {
					ftu.forEach((file) => {
						const filePath = path.join(fetchPath, file.path);
						filesToUpload.push({
							path: filePath,
							name: path.basename(filePath),
							size: parseInt(file.size),
							sourcePath: path.join(folder.path, file.path),
						});
					});
				}
			}
		} catch (err) {
			error("Error on upload/Lightbox: " + folder.path);
			error(err);
		}
		await fetchFilesToUpload(folders, index + 1);
	};
	await fetchFilesToUpload(folders);
	uploadFilesRecursive(filesToUpload, identifier);
}

ipcMain.on("abortUpload", () => {
	uploadManager.cancelAllUpload();
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

function setMainMenu() {
	if (!mainWindow) return;
	const homeUrl = store.get("homeUrl");
	const template = [
		{
			label: "eMedia Library",
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
				{
					label: "Settings",
					accelerator: "CmdOrCtrl+,",
					click: () => {
						openConfigPage();
					},
				},
				{ type: "separator" },
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
			label: "Window",
			submenu: [
				{
					label: "Home",
					click: () => {
						mainWindow.show();
						openWorkspace(homeUrl);
					},
				},
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
						mainWindow.webContents.reload();
					},
				},
				{
					label: "Refresh (Legacy)",
					accelerator: "F5",
					click() {
						showLoader();
						mainWindow.webContents.reloadIgnoringCache();
					},
					visible: false,
					acceleratorWorksWhenHidden: true,
				},
				{ type: "separator" },
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
				{ type: "separator" },
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
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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

async function fetchSubFolderContent(categorypath, callback, args = null) {
	let categories = [];
	if (!categorypath) return categories;
	log("Fetching from: " + categorypath);
	const url = getMediaDbUrl("services/module/asset/entity/pullfolderlist.json");
	try {
		const res = await axios.post(
			url,
			{ categorypath: categorypath },
			{ headers: connectionOptions.headers }
		);

		if (res.data !== undefined) {
			categories = res.data.categories;
			if (categories && categories.length >= 0) {
				if (categories.length > 0) {
					const dir = path.join(currentWorkDirectory, categories[0].path);
					if (!fs.existsSync(dir)) {
						fs.mkdirSync(dir, { recursive: true });
					}
				}

				addExtraFoldersToList(categories, categorypath);

				if (callback) {
					if (args) {
						callback(categories, args);
					} else {
						callback(categories);
					}
				}
			}
		}
	} catch (err) {
		error("Error loading: " + url);
		error(err);
	}
	return categories;
}

async function scanFiles(categories) {
	let result = {
		hasUploads: false,
		hasDownloads: false,
	};

	async function scanFilesRecursive(cats, index = 0) {
		if (index >= cats.length || (result.hasDownloads && result.hasUploads))
			return;
		let category = cats[index];
		let fetchPath = path.join(currentWorkDirectory, category.path);

		let data = {};
		if (fs.existsSync(fetchPath)) {
			data = getFilesByDirectory(fetchPath, true);
		} else {
			data = { files: [] };
		}
		data.categorypath = category.path;

		try {
			const res = await axios.post(
				getMediaDbUrl("services/module/asset/entity/pullpendingfiles.json"),
				data,
				{ headers: connectionOptions.headers }
			);
			if (res.data !== undefined) {
				if (!result.hasUploads) {
					const filesToUpload = res.data.filestoupload;
					result.hasUploads = filesToUpload && filesToUpload.length > 0;
				}
				if (!result.hasDownloads) {
					const filesToDownload = res.data.filestodownload;
					result.hasDownloads = filesToDownload && filesToDownload.length > 0;
				}
				if (!result.hasDownloads || !result.hasUploads) {
					await scanFilesRecursive(cats, index + 1);
				}
			} else {
				throw new Error("No data found");
			}
		} catch (err) {
			error("Error on scan Folder: " + category.path);
			error(err);
		}
	}

	await scanFilesRecursive(categories);

	return result;
}

ipcMain.handle(
	"scanChanges",
	async (_, { toplevelcategorypath, lightbox = "" }) => {
		const categoryPath = path.join(toplevelcategorypath, lightbox);
		const categories = await fetchSubFolderContent(categoryPath);
		const result = await scanFiles(categories);
		return result;
	}
);

const downloadAbortControllers = {};
const cancelledDownloads = {};

async function downloadFilesRecursive(files, identifier) {
	let currentFileIndex = 0;
	let totalFiles = files.length;
	let completedFiles = 0;
	let failedFiles = 0;

	// Function to update overall progress
	const updateOverallProgress = () => {
		mainWindow.webContents.send("sync-progress-update", {
			completed: completedFiles,
			failed: failedFiles,
			total: totalFiles,
			// remaining: totalFiles - completedFiles - failedFiles,
			// percent: Math.round(
			// 	(completedFiles / (totalFiles ? totalFiles : 1)) * 100
			// ),
			identifier,
			isDownload: true,
		});
	};

	updateOverallProgress();

	const processNextFile = async () => {
		if (cancelledDownloads[identifier]) {
			delete downloadAbortControllers[identifier];
			delete cancelledDownloads[identifier];
			return;
		}
		// Check if we've processed all files
		if (currentFileIndex >= totalFiles) {
			delete downloadAbortControllers[identifier];
			mainWindow.webContents.send("sync-completed", {
				success: true,
				completed: completedFiles,
				failed: failedFiles,
				total: totalFiles,
				identifier,
				remaining: Object.keys(downloadAbortControllers),
				isDownload: true,
			});
			return;
		}

		const currentFile = files[currentFileIndex];
		currentFile.size = currentFile.size;
		currentFile.mime = mime.lookup(currentFile.name);

		const fileStatusPayload = {
			index: currentFileIndex,
			name: clipTextMiddle(currentFile.name),
			size: currentFile.size,
			identifier,
		};

		// Update current file status to "downloading"
		mainWindow.webContents.send("file-status-update", {
			...fileStatusPayload,
			status: "downloading",
			progress: 0,
			isDownload: true,
		});

		// Debounce progress updates
		let lastProgressUpdate = 0;

		try {
			// Download the file with progress tracking
			downloadAbortControllers[identifier] = await eDownload(
				mainWindow,
				currentFile.url,
				{
					directory: currentFile.saveTo,
					// onTotalProgress,
					onProgress: (progress) => {
						// Send individual file progress
						if (Date.now() - lastProgressUpdate < 500) return;
						lastProgressUpdate = Date.now();
						mainWindow.webContents.send("file-progress-update", {
							...fileStatusPayload,
							loaded: progress.transferredBytes,
							total: progress.totalBytes,
							percent: progress.percent,
							isDownload: true,
						});
					},
					onCompleted: () => {
						// Mark file as completed
						completedFiles++;
						mainWindow.webContents.send("file-status-update", {
							...fileStatusPayload,
							status: "completed",
							progress: 100,
							isDownload: true,
						});
					},
					openFolderWhenDone: false,
					overwrite: true,
					saveAs: currentFile.saveTo === undefined,
					showBadge: true,
					showProgressBar: true,
				}
			);
		} catch (error) {
			if (!error instanceof CancelError) {
				// Mark file as failed
				failedFiles++;
				mainWindow.webContents.send("file-status-update", {
					...fileStatusPayload,
					status: "failed",
					error: error.message,
					isDownload: true,
				});

				error(`Error downloading file ${currentFile.name}:`);
			}
		}

		// Update overall progress
		updateOverallProgress();

		// Move to next file
		currentFileIndex++;

		// Process the next file
		setTimeout(processNextFile, 1000);
	};

	// Start processing files
	processNextFile();
}

async function downloadLightbox(folders, identifier) {
	if (!identifier) {
		log("identifier not found for download/Lightbox");
		return;
	}
	if (folders.length === 0) {
		log("folders not found for download/Lightbox");
		return;
	}

	const downloadURLRoot = parseURL(store.get("homeUrl"), true);
	const filesToDownload = [];
	const fetchFilesToDownload = async (folders, index) => {
		if (index >= folders.length) return;
		const folder = folders[index];
		try {
			const fetchPath = path.join(currentWorkDirectory, folder.path);
			let data = {};
			if (fs.existsSync(fetchPath)) {
				data = getFilesByDirectory(fetchPath, true);
			} else {
				data = { files: [] };
			}
			data.categorypath = folder.path;
			const res = await axios.post(
				getMediaDbUrl("services/module/asset/entity/pullpendingfiles.json"),
				data,
				{ headers: connectionOptions.headers }
			);

			if (res.data !== undefined) {
				const ftd = res.data.filestodownload;
				if (ftd !== undefined) {
					ftd.forEach((file) => {
						const filePath = path.join(fetchPath, file.path);
						filesToDownload.push({
							path: filePath,
							name: path.basename(filePath),
							size: parseInt(file.size),
							url:
								downloadURLRoot.protocol +
								"//" +
								downloadURLRoot.host +
								file.url,
							saveTo: fetchPath,
						});
					});
				}
			}
		} catch (err) {
			error("Error on upload/Lightbox: " + folder.path);
			error(err);
		}
		await fetchFilesToDownload(folders, index + 1);
	};
	await fetchFilesToDownload(folders, 0);

	mainWindow.webContents.send("sync-started", {
		total: filesToDownload.length,
		identifier,
		isDownload: true,
	});

	downloadFilesRecursive(filesToDownload, identifier);
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
	(_, { categorypath, filename, dlink, useexternalsync = false }) => {
		const filePath = path.join(currentWorkDirectory, categorypath, filename);
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

ipcMain.on("openFolder", (_, { path: folderPath, lightbox = null }) => {
	if (!folderPath.startsWith("/") && !folderPath.match(/^[a-zA-Z]:/)) {
		folderPath = path.join(currentWorkDirectory, folderPath);
	}
	if (lightbox && lightbox.length > 0) {
		folderPath = path.join(folderPath, lightbox);
	}
	openFolder(folderPath);
});

function openFolder(path) {
	log("Opening folder: " + path);
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

function isValidDownload(identifier) {
	if (downloadAbortControllers[identifier] !== undefined) return false;
	const identifiers = Object.keys(downloadAbortControllers);
	for (let i = 0; i < identifiers.length; i++) {
		const identifier2 = identifiers[i];
		if (identifier === identifier2) return false;
		else if (identifier.startsWith(identifier2)) return false;
		else if (identifier2.startsWith(identifier)) return false;
	}
	return true;
}

function handleLightboxDownload(categoryPath, notifyDuplicate = true) {
	if (Object.keys(downloadAbortControllers).length > 3) {
		mainWindow.webContents.send("too-many-downloads", {
			categoryPath,
		});
		return false;
	}
	if (!isValidDownload(categoryPath)) {
		if (notifyDuplicate) {
			mainWindow.webContents.send("duplicate-download", {
				categoryPath,
			});
		}
		return false;
	}
	downloadAbortControllers[categoryPath] = true;
	log("Syncing Down: " + categoryPath);
	fetchSubFolderContent(categoryPath, downloadLightbox, categoryPath);
	return true;
}

ipcMain.handle(
	"lightboxDownload",
	async (_, { toplevelcategorypath, lightbox = "" }) => {
		const categoryPath = path.join(toplevelcategorypath, lightbox);
		openFolder(path.join(currentWorkDirectory, categoryPath));
		return handleLightboxDownload(categoryPath);
	}
);

function isValidUpload(identifier) {
	if (uploadAbortControllers[identifier] !== undefined) return false;
	const ongoing = Object.keys(uploadAbortControllers);
	for (let i = 0; i < ongoing.length; i++) {
		if (identifier === ongoing[i]) return false;
		else if (identifier.startsWith(ongoing[i])) return false;
		else if (ongoing[i].startsWith(identifier)) return false;
	}
	return true;
}

function handleLightboxUpload(categoryPath, notifyDuplicate = true) {
	//Check if the same categoryPath is already being processed
	if (Object.keys(uploadAbortControllers).length > 3) {
		mainWindow.webContents.send("too-many-uploads", {
			categoryPath,
		});
		return false;
	}
	if (!isValidUpload(categoryPath)) {
		if (notifyDuplicate) {
			mainWindow.webContents.send("duplicate-upload", {
				categoryPath,
			});
		}
		return false;
	}
	uploadAbortControllers[categoryPath] = true;
	log("Syncing Up: " + categoryPath);
	fetchSubFolderContent(categoryPath, uploadLightbox, categoryPath);
	return true;
}

ipcMain.handle(
	"lightboxUpload",
	async (_, { toplevelcategorypath, lightbox = "" }) => {
		const categoryPath = path.join(toplevelcategorypath, lightbox);
		return handleLightboxUpload(categoryPath);
	}
);

ipcMain.on("continueSync", async (_, { categorypath, isDownload }) => {
	if (isDownload) {
		handleLightboxDownload(categorypath, false);
	} else {
		handleLightboxUpload(categorypath, false);
	}
});

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
		data = getFilesByDirectory(fetchpath, true);
	} else {
		data = { files: [] };
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

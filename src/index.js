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
	screen,
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
const { randomUUID } = require("node:crypto");

require("dotenv").config();

const {
	SYNC_PROGRESS_UPDATE,
	SYNC_FOLDER_DELETED,
	SYNC_CANCELLED,
	SYNC_STARTED,
	SYNC_COMPLETED,
	FILE_PROGRESS_UPDATE,
	FILE_STATUS_UPDATE,
	CHECK_SYNC,
} = require("./const");

electronLog.initialize();
electronLog.transports.console.level = "debug";
electronLog.transports.console.format = "[ {h}:{i}:{s}.{ms} ] {text}";

const isDev = process.env.NODE_ENV === "development";

if (process.defaultApp) {
	if (process.argv.length >= 2) {
		app.setAsDefaultProtocolClient("emedia", process.execPath, [
			path.resolve(process.argv[1]),
		]);
	}
} else {
	app.setAsDefaultProtocolClient("emedia");
}

let computerName = OS.userInfo().username + OS.hostname();
computerName = computerName.replace(/[^A-Za-z0-9@\.\-]/g, "_");

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

const DESKTOP_API_VERSION = 1;

const store = new Store();
const appIcon = nativeImage.createFromPath(
	path.join(__dirname, "../images/icon.png")
);

const currentVersion = app.getVersion();

function log(...args) {
	try {
		console.log("\n");
		electronLog.debug(...args);
		console.log("\n");
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
		console.log("\n");
		electronLog.error(...args);
		console.log("\n");
	} catch (e) {
		console.error(e);
	} finally {
		if (mainWindow) {
			mainWindow.webContents.send("electron-error", args);
		}
	}
}

let downloadAbortControllers = {};
let cancelledDownloads = {};

let uploadAbortControllers = {};
let cancelledUploads = {};

function resetMemory() {
	downloadAbortControllers = {};
	cancelledDownloads = {};
	uploadAbortControllers = {};
	cancelledUploads = {};
}

const createWindow = () => {
	const primaryDisplay = screen.getPrimaryDisplay();
	const { width, height } = primaryDisplay.workAreaSize;
	mainWindow = new BrowserWindow({
		width,
		height,
		x: 0,
		y: 0,
		maxWidth: width,
		maxHeight: height,
		minWidth: 1000,
		minHeight: 600,
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
		mainWindow.maximize();
		mainWindow.setVisibleOnAllWorkspaces(true);
		hideLoader();
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
		mainWindow.webContents.send("siteLoaded", {
			rootPath: currentWorkDirectory,
			downloadPath: currentDownloadDirectory,
		});
	});
	mainWindow.webContents.on("did-stop-loading", () => {
		hideLoader();
	});
	mainWindow.webContents.on("did-navigate-in-page", () => {
		setMainMenu();
	});

	mainWindow.webContents.session.on("will-download", async (_, item) => {
		// e.preventDefault();
		const filename = item.getFilename();
		let savePath = item.getSavePath();
		if (!savePath) {
			savePath = path.join(currentDownloadDirectory, filename);
			item.setSavePath(savePath);
		}

		item.once("done", (_, state) => {
			if (!item.getSavePath().startsWith(currentDownloadDirectory)) return;
			if (state === "completed") {
				mainWindow.webContents.send("download-update", {
					filename,
					message: "Successfully downloaded " + filename,
				});
			} else if (state === "interrupted") {
				mainWindow.webContents.send("download-update", {
					filename,
					message: "Failed to download " + filename,
					error: true,
				});
			}
		});
	});

	mainWindow.on("page-title-updated", (event, title) => {
		event.preventDefault();
		mainWindow.webContents.send("page-title-updated", title);
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
				// visible: isDev,
				click() {
					mainWindow.webContents.inspectElement(props.x, props.y);
				},
			},
		];

		const menu = Menu.buildFromTemplate(template);
		menu.popup({});
	});
}

app.on("second-instance", (_, commandLine) => {
	if (mainWindow) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	}
	const fromUrl = commandLine.pop();

	if (fromUrl.startsWith("emedia://")) {
		handleDeepLink(fromUrl);
	}
});

app.whenReady().then(() => {
	createWindow();
	createTray();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		} else {
			showApp(false);
		}
	});
});

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
	handleDeepLink(url);
});

function handleDeepLink(url) {
	const parsedUrl = parseURL(url, true);
	const query = qs.parse(parsedUrl.query);
	if (query.page === "config") {
		openConfigPage();
	} else if (query.url) {
		log(query.url);
		openWorkspace(query.url);
	}
}

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.exit(0);
	}
});

app.on("before-quit", () => {
	mainWindow.removeAllListeners("close");
	mainWindow.destroy();
});

function showApp(reload = true) {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
			mainWindow.focus();
		}
		mainWindow.show();
		if (reload) {
			const homeUrl = store.get("homeUrl");
			resetMemory();
			openWorkspace(homeUrl);
		}
	}
}
function showAbout() {
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
}
function createTray() {
	const trayMenu = [];
	trayMenu.push({
		label: "Show App",
		click: () => {
			showApp(false);
		},
	});
	trayMenu.push({ type: "separator" });
	trayMenu.push({
		label: "Home",
		click: () => {
			showApp();
		},
		accelerator: "CmdOrCtrl+H",
	});
	trayMenu.push({
		label: "Libraries Settings",
		click() {
			openConfigPage();
		},
		accelerator: "CmdOrCtrl+,",
	});
	trayMenu.push({
		label: "About",
		click() {
			showAbout();
		},
		accelerator: "CmdOrCtrl+I",
	});
	trayMenu.push({ type: "separator" });
	trayMenu.push({
		label: "Exit",
		click: () => {
			app.isQuitting = true;
			app.quit();
		},
		accelerator: "CmdOrCtrl+Q",
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
	} catch (err) {
		log(err);
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
		platform: process.platform,
		currentDesktopVersion: DESKTOP_API_VERSION,
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
		userAgent =
			userAgent +
			" eMediaDesktop/" +
			app.getVersion() +
			" APIVersion/" +
			DESKTOP_API_VERSION +
			" ComputerName/" +
			computerName;
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
	mainWindow.webContents.send("siteLoaded", {
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

function clipTextMiddle(text, maxLength = 100) {
	if (text.length <= maxLength) {
		return text;
	}

	const charsPerSide = Math.floor((maxLength - 3) / 2);
	const leftSide = text.substring(0, charsPerSide);
	const rightSide = text.substring(text.length - charsPerSide);

	return leftSide + "..." + rightSide;
}

async function uploadFilesRecursive(files, identifier, onFinished) {
	let currentFileIndex = 0;
	let totalFiles = files.length;
	let completedFiles = 0;
	let failedFiles = 0;

	if (totalFiles === 0) {
		onFinished({
			success: true,
			completed: 0,
			failed: 0,
			total: 0,
			identifier,
			remaining: Object.keys(uploadAbortControllers),
		});
		return;
	}

	// Function to update overall progress
	const updateOverallProgress = () => {
		mainWindow.webContents.send(SYNC_PROGRESS_UPDATE, {
			completed: completedFiles,
			failed: failedFiles,
			total: totalFiles,
			identifier,
		});
	};

	updateOverallProgress();

	// Process files one by one
	const processNextFile = async () => {
		if (cancelledUploads[identifier]) {
			onFinished({
				success: true,
				cancelled: true,
				completed: completedFiles,
			});
			return;
		}
		// Check if we've processed all files
		if (currentFileIndex >= totalFiles) {
			onFinished({
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
		mainWindow.webContents.send(FILE_STATUS_UPDATE, {
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
					mainWindow.webContents.send(FILE_PROGRESS_UPDATE, {
						...fileStatusPayload,
						loaded: progress.transferred,
						total: progress.total,
						percent: progress.percent,
					});
				});

			// Mark file as completed
			completedFiles++;
			mainWindow.webContents.send(FILE_STATUS_UPDATE, {
				...fileStatusPayload,
				status: "completed",
				progress: 100,
			});
		} catch (err) {
			// Mark file as failed
			failedFiles++;
			mainWindow.webContents.send(FILE_STATUS_UPDATE, {
				...fileStatusPayload,
				status: "failed",
				error: err.message,
			});
			console.log(err);
			error(`Error uploading file ${currentFile.name}:`);
		}

		// Update overall progress
		updateOverallProgress();

		// Move to next file
		currentFileIndex++;

		// Process the next file
		setTimeout(processNextFile, 100);
	};

	// Start processing files
	processNextFile();
}

ipcMain.on("deleteSync", (_, { identifier, isDownload, delId }) => {
	cancelSync({ identifier, isDownload, both: true }, () => {
		axios
			.delete(
				getMediaDbUrl("services/module/desktopsyncfolder/data/" + delId),
				{
					headers: connectionOptions.headers,
				}
			)
			.then(() => {
				mainWindow.webContents.send(SYNC_FOLDER_DELETED, {
					delId,
					isDownload,
					remaining: isDownload
						? Object.keys(downloadAbortControllers)
						: Object.keys(uploadAbortControllers),
				});
			})
			.catch((err) => {
				mainWindow.webContents.send(SYNC_FOLDER_DELETED, {
					delId,
					success: false,
				});
				error(err);
			});
	});
});

function cancelSync(
	{ identifier, isDownload = false, both = false },
	onCancelled
) {
	if (isDownload || both) {
		cancelledDownloads[identifier] = true;
		downloadAbortControllers[identifier]?.cancel?.();
		delete downloadAbortControllers[identifier];
	}
	if (!isDownload || both) {
		cancelledUploads[identifier] = true;
		uploadAbortControllers[identifier]?.abort?.();
		delete uploadAbortControllers[identifier];
	}
	onCancelled();
}

ipcMain.on("cancelSync", (_, { identifier, isDownload, both = false }) => {
	cancelSync({ identifier, isDownload, both }, () => {
		mainWindow.webContents.send(SYNC_CANCELLED, {
			identifier,
			isDownload,
			both,
			remaining: isDownload
				? Object.keys(downloadAbortControllers)
				: Object.keys(uploadAbortControllers),
		});
	});
});

ipcMain.on(CHECK_SYNC, () => {
	mainWindow.webContents.send(CHECK_SYNC, {
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

	return filePaths;
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
	const fetchFilesToUpload = async (folders, index = 0) => {
		if (index >= folders.length) {
			delete uploadAbortControllers[identifier];
			delete cancelledUploads[identifier];
			return;
		}

		const filesToUpload = [];

		const folder = folders[index];
		const fetchPath = path.join(currentWorkDirectory, folder.path);
		console.log("Fetching files to be uploaded into: " + fetchPath);

		try {
			let data = {};
			if (fs.existsSync(fetchPath)) {
				data = { files: getFilesByDirectory(fetchPath) };
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

		mainWindow.webContents.send(SYNC_STARTED, {
			total: filesToUpload.length,
			identifier,
		});

		console.log("Files to upload: ", filesToUpload);

		await uploadFilesRecursive(
			filesToUpload,
			identifier,
			async (uploadSummary) => {
				console.log("Upload summary: ", uploadSummary);

				if (uploadSummary.success) {
					mainWindow.webContents.send(SYNC_COMPLETED, uploadSummary);
				}

				await fetchFilesToUpload(folders, index + 1);
			}
		);
	};

	await fetchFilesToUpload(folders);
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

ipcMain.on("goBack", () => {
	if (mainWindow && mainWindow.webContents.navigationHistory.canGoBack()) {
		mainWindow.webContents.navigationHistory.goBack();
	} else {
		const homeUrl = store.get("homeUrl");
		if (homeUrl) {
			ß;
			openWorkspace(homeUrl);
			ß;
		}
	}
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
			id: "eMediaMenu",
			submenu: [
				{
					label: "Home",
					click: () => {
						showApp();
					},
					accelerator: "CmdOrCtrl+H",
				},
				{
					label: "About",
					click() {
						showAbout();
					},
					accelerator: "CmdOrCtrl+I",
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
			id: "editMenu",
		},
		{
			label: "Window",
			id: "windowMenu",
			submenu: [
				{
					label: "Home",
					click: () => {
						showApp();
					},
					accelerator: "CmdOrCtrl+H",
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
					label: "Forward",
					accelerator: "CmdOrCtrl+Right",
					click() {
						mainWindow.webContents.navigationHistory.goForward();
					},
					enabled: mainWindow.webContents.navigationHistory.canGoForward(),
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
ipcMain.on("menu-action", (_, action) => {
	const menus = Menu.getApplicationMenu();
	if (!menus) return;
	const menu = menus.getMenuItemById(action);
	if (!menu) return;
	const submenu = menu.submenu;
	if (!submenu) return;
	submenu.popup();
});

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
	const parent = path.join(currentWorkDirectory, categoryPath);
	let idx = categories.length;
	if (!fs.existsSync(parent)) {
		return;
	}
	const files = fs.readdirSync(parent);
	files.forEach((file) => {
		const filePath = path.join(parent, file);
		let stats = fs.statSync(filePath);
		if (stats.isDirectory()) {
			const catPath = path.relative(currentWorkDirectory, filePath);
			const exists = categories.some((cat) => cat.path === catPath);
			if (exists) return;
			categories.push({
				index: idx++,
				id: randomUUID(),
				name: file,
				path: catPath,
			});
		}
	});
}

async function fetchSubFolderContent(
	categorypath,
	callback,
	args = null,
	extras = false
) {
	let categories = [];
	if (!categorypath) return categories;
	categories = [
		{
			index: 0,
			id: randomUUID(),
			name: path.basename(categorypath),
			path: categorypath,
		},
	];
	log("Fetching subfolders from: " + categorypath);
	const url = getMediaDbUrl("services/module/asset/entity/pullfolderlist.json");
	try {
		const res = await axios.post(
			url,
			{ categorypath: categorypath },
			{ headers: connectionOptions.headers }
		);

		if (res.data !== undefined) {
			const cats = res.data.categories;
			if (cats && cats.length >= 0) {
				cats.forEach((cat) => {
					const dir = path.join(currentWorkDirectory, cat.path);
					if (!fs.existsSync(dir)) {
						fs.mkdirSync(dir, { recursive: true });
					}
					categories.push(cat);
				});
				console.log({ categories });

				if (extras) {
					addExtraFoldersToList(categories, categorypath);
				}
				if (callback) {
					console.log({ categories });
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
}

async function downloadFilesRecursive(files, identifier, onFinished) {
	let currentFileIndex = 0;
	let totalFiles = files.length;
	let completedFiles = 0;
	let failedFiles = 0;

	if (totalFiles === 0) {
		onFinished({
			success: true,
			completed: 0,
			failed: 0,
			total: 0,
			identifier,
			remaining: Object.keys(downloadAbortControllers),
			isDownload: true,
		});
		return;
	}

	// Function to update overall progress
	const updateOverallProgress = () => {
		mainWindow.webContents.send(SYNC_PROGRESS_UPDATE, {
			completed: completedFiles,
			failed: failedFiles,
			total: totalFiles,
			identifier,
			isDownload: true,
		});
	};

	updateOverallProgress();

	const processNextFile = async () => {
		if (cancelledDownloads[identifier]) {
			onFinished({
				success: true,
				cancelled: true,
				completed: completedFiles,
				isDownload: true,
			});
			return;
		}
		// Check if we've processed all files
		if (currentFileIndex >= totalFiles) {
			onFinished({
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
		mainWindow.webContents.send(FILE_STATUS_UPDATE, {
			...fileStatusPayload,
			status: "downloading",
			progress: 0,
			isDownload: true,
		});

		// Debounce progress updates
		let lastProgressUpdate = 0;

		try {
			// Download the file with progress tracking
			await eDownload(mainWindow, currentFile.url, {
				directory: currentFile.saveTo,
				onStarted: (item) => {
					downloadAbortControllers[identifier] = item;
				},
				// onTotalProgress,
				onProgress: (progress) => {
					// Send individual file progress
					if (Date.now() - lastProgressUpdate < 500) return;
					lastProgressUpdate = Date.now();
					mainWindow.webContents.send(FILE_PROGRESS_UPDATE, {
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
					mainWindow.webContents.send(FILE_STATUS_UPDATE, {
						...fileStatusPayload,
						status: "completed",
						progress: 100,
						isDownload: true,
					});
				},
				openFolderWhenDone: false,
				overwrite: true,
				saveAs: currentFile.saveTo === undefined,
				showBadge: false,
				showProgressBar: false,
			});
		} catch (err) {
			if (!err instanceof CancelError) {
				// Mark file as failed
				failedFiles++;
				mainWindow.webContents.send(FILE_STATUS_UPDATE, {
					...fileStatusPayload,
					status: "failed",
					error: err.message,
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
		setTimeout(processNextFile, 100);
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

	const fetchFilesToDownload = async (folders, index) => {
		if (index >= folders.length) {
			delete downloadAbortControllers[identifier];
			delete cancelledDownloads[identifier];
			return;
		}
		const filesToDownload = [];

		const folder = folders[index];
		try {
			const fetchPath = path.join(currentWorkDirectory, folder.path);
			console.log("Fetching files to be downloaded into: " + fetchPath);
			let data = {};
			if (fs.existsSync(fetchPath)) {
				data = { files: getFilesByDirectory(fetchPath) };
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
			error("Error on download/Lightbox: " + folder.path);
			error(err);
		}

		mainWindow.webContents.send(SYNC_STARTED, {
			total: filesToDownload.length,
			identifier,
			isDownload: true,
		});

		console.log("Files to download: ", filesToDownload);
		await downloadFilesRecursive(
			filesToDownload,
			identifier,
			async (downloadSummary) => {
				console.log("Download summary: ", downloadSummary);

				if (downloadSummary.success) {
					mainWindow.webContents.send(SYNC_COMPLETED, downloadSummary);
				}

				fetchFilesToDownload(folders, index + 1);
			}
		);
	};

	await fetchFilesToDownload(folders, 0);
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

ipcMain.on("openFileWithDefault", (_, { categorypath, filename, dlink }) => {
	const filePath = path.join(currentWorkDirectory, categorypath, filename);
	if (fs.existsSync(filePath)) {
		openFile(filePath);
	} else {
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
		}).catch((err) => {
			error(err);
		});
	}
});

ipcMain.on(
	"openFolder",
	(_, { customRoot, folderPath, dropFromFolderPath = null }) => {
		let rootDir = currentWorkDirectory;
		if (customRoot && customRoot.length > 0) {
			if (customRoot.startsWith("$HOME")) {
				customRoot = customRoot.replace("$HOME", OS.homedir());
			}
			customRoot = path.normalize(customRoot);
			rootDir = customRoot;
		}

		folderPath = path.normalize(folderPath);

		if (dropFromFolderPath) {
			dropFromFolderPath = path.normalize(dropFromFolderPath);
			if (folderPath.startsWith(dropFromFolderPath)) {
				folderPath = path.relative(dropFromFolderPath, folderPath);
			}
		}

		if (!folderPath.startsWith("/") && !folderPath.match(/^[a-zA-Z]:/)) {
			folderPath = path.join(rootDir, folderPath);
		}
		openFolder(folderPath);
	}
);

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

function handleLightboxDownload(categoryPath) {
	if (Object.keys(downloadAbortControllers).length > 3) {
		return "TOO_MANY_DOWNLOADS";
	}
	if (!isValidDownload(categoryPath)) {
		return "DUPLICATE_DOWNLOAD";
	}
	downloadAbortControllers[categoryPath] = true;
	log("Syncing Down: " + categoryPath);
	fetchSubFolderContent(categoryPath, downloadLightbox, categoryPath);
	return "OK";
}

ipcMain.handle("lightboxDownload", async (_, categoryPath) => {
	openFolder(path.join(currentWorkDirectory, categoryPath));
	return handleLightboxDownload(categoryPath);
});

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

function handleLightboxUpload(categoryPath) {
	//Check if the same categoryPath is already being processed
	if (Object.keys(uploadAbortControllers).length > 3) {
		return "TOO_MANY_UPLOADS";
	}
	if (!isValidUpload(categoryPath)) {
		return "DUPLICATE_UPLOAD";
	}
	uploadAbortControllers[categoryPath] = true;
	log("Syncing Up: " + categoryPath);
	fetchSubFolderContent(categoryPath, uploadLightbox, categoryPath, true);
	return "OK";
}

ipcMain.handle("lightboxUpload", async (_, categoryPath) => {
	return handleLightboxUpload(categoryPath);
});

ipcMain.handle("continueSync", async (_, { categoryPath, isDownload }) => {
	if (isDownload) {
		openFolder(path.join(currentWorkDirectory, categoryPath));
		return handleLightboxDownload(categoryPath);
	} else {
		return handleLightboxUpload(categoryPath);
	}
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

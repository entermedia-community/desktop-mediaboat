const fs = require("node:fs");
const OS = require("node:os");
const path = require("node:path");
const { parse: parseURL } = require("node:url");
const qs = require("node:querystring");

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
} = require("electron/main");

const axios = require("axios");
const Store = require("electron-store");
const electronLog = require("electron-log");
const { download: eDownload } = require("electron-dl");

const syncConstants = require("./const");
const fsUtils = require("./services/fs-utils");
const { createSyncService } = require("./services/sync-service");
const { createFileService } = require("./services/file-service");
const { createUpdaterService } = require("./services/updater");

require("dotenv").config();

if (require("electron-squirrel-startup")) return;

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

const defaultWorkDirectory = path.join(
	app.getPath("home"),
	"eMedia" + path.sep,
);
const defaultDownloadDirectory = app.getPath("downloads");

let currentWorkDirectory = defaultWorkDirectory;
let currentDownloadDirectory = defaultDownloadDirectory;

let connectionOptions = {
	headers: { "X-computername": computerName },
};

let mainWindow = null;
let loaderWindow = null;
let tray = null;
let firstBoot = true;

const DESKTOP_API_VERSION = 2;
const store = new Store();
const appIcon = nativeImage.createFromPath(
	path.join(__dirname, "../images/icon.png"),
);
const currentVersion = app.getVersion();

let servicesInitialized = false;
let syncService = null;
let fileService = null;
let updaterService = null;

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

function getMediaDbUrl(url) {
	const mediaDbUrl = store.get("mediadburl");
	if (!mediaDbUrl) {
		error("No MediaDB url found");
		return url;
	}
	return mediaDbUrl + "/" + url;
}

function showLoader() {
	hideLoader(() => {
		loaderWindow = new BrowserWindow({
			width: 400,
			height: 400,
			alwaysOnTop: true,
			resizable: false,
			frame: false,
			movable: false,
			show: false,
			hasShadow: false,
			icon: appIcon,
		});

		loaderWindow.loadFile(path.join(__dirname, "loader.html"));
		loaderWindow.once("ready-to-show", () => {
			loaderWindow.show();
		});
	});
}

function hideLoader(cb = null) {
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

function openConfigPage() {
	mainWindow.loadFile(path.join(__dirname, "welcome.html"));
}

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
			{ type: "separator" },
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
			{ type: "separator" },
			{
				id: "inspect",
				label: "Inspect Element",
				click() {
					mainWindow.webContents.inspectElement(props.x, props.y);
				},
			},
		];

		const menu = Menu.buildFromTemplate(template);
		menu.popup({});
	});
}

function showApp(reload = true) {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
			mainWindow.focus();
		}
		mainWindow.show();
		if (reload) {
			const homeUrl = store.get("homeUrl");
			syncService?.resetMemory();
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
				fileService?.openFolder(path.dirname(logFile.path));
			}
		});
}

function createTray() {
	const trayMenu = [
		{
			label: "Show App",
			click: () => {
				showApp(false);
			},
		},
		{ type: "separator" },
		{
			label: "Home",
			click: () => {
				showApp();
			},
			accelerator: "CmdOrCtrl+H",
		},
		{
			label: "Libraries Settings",
			click() {
				openConfigPage();
			},
			accelerator: "CmdOrCtrl+,",
		},
		{
			label: "About",
			click() {
				showAbout();
			},
			accelerator: "CmdOrCtrl+I",
		},
		{ type: "separator" },
		{
			label: "Exit",
			click: () => {
				updaterService?.cancelUpdateDownload();
				app.isQuitting = true;
				app.quit();
			},
			accelerator: "CmdOrCtrl+Q",
		},
	];

	const trayIcon = nativeImage.createFromPath(
		path.join(__dirname, "assets/images/ems.png"),
	);
	tray = new Tray(trayIcon);
	tray.setToolTip("eMedia Library");
	tray.setContextMenu(Menu.buildFromTemplate(trayMenu));

	if (process.platform === "darwin") {
		const dockMenu = Menu.buildFromTemplate([
			trayMenu[1],
			{ ...trayMenu[3], label: "Settings" },
		]);
		app.dock.setMenu(dockMenu);
	}
}

function setMainMenu() {
	if (!mainWindow) return;
	const updateDownloader = updaterService?.getUpdateDownloader();

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
					label: "Settings",
					accelerator: "CmdOrCtrl+,",
					click: () => {
						openConfigPage();
					},
				},
				{ type: "separator" },
				{
					label: "About",
					click() {
						showAbout();
					},
					accelerator: "CmdOrCtrl+I",
				},
				{
					label: updateDownloader
						? "Downloading Update..."
						: "Check for Updates...",
					enabled: !updateDownloader,
					click: () => {
						updaterService?.checkForUpdates();
					},
				},
				{ type: "separator" },
				{
					label: "Exit",
					accelerator: "CmdOrCtrl+Q",
					click() {
						updaterService?.cancelUpdateDownload();
						app.isQuitting = true;
						app.quit();
					},
				},
			],
		},
		{ label: "Edit", role: "editMenu", id: "editMenu" },
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

function createWindow() {
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

	initServices();

	mainWindow.once("ready-to-show", () => {
		mainWindow.maximize();
		mainWindow.setVisibleOnAllWorkspaces(true);
		hideLoader();
		if (firstBoot) {
			updaterService?.checkForUpdates(true);
		}
		firstBoot = false;
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
}

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

function initServices() {
	if (servicesInitialized) return;

	fileService = createFileService({
		app,
		ipcMain,
		dialog,
		shell,
		eDownload,
		getMainWindow: () => mainWindow,
		getCurrentWorkDirectory: () => currentWorkDirectory,
		getStore: () => store,
		readDirectory: fsUtils.readDirectory,
		getDirectoryStats: fsUtils.getDirectoryStats,
		log,
		error,
	});

	syncService = createSyncService({
		ipcMain,
		getMainWindow: () => mainWindow,
		getStore: () => store,
		getCurrentWorkDirectory: () => currentWorkDirectory,
		getMediaDbUrl,
		getConnectionOptions: () => connectionOptions,
		openFolder: (folderPath) => fileService.openFolder(folderPath),
		log,
		error,
		constants: syncConstants,
		fsUtils,
	});

	updaterService = createUpdaterService({
		getMainWindow: () => mainWindow,
		getCurrentVersion: () => currentVersion,
		onUpdateStateChange: () => setMainMenu(),
		logError: error,
	});

	fileService.registerIpcHandlers();
	syncService.registerIpcHandlers();

	servicesInitialized = true;
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
		const homeUrl = await store.get("homeUrl");
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
				},
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
			openWorkspace(homeUrl);
		}
	}
});

ipcMain.on("openExternal", (_, url) => {
	shell.openExternal(url);
});

ipcMain.on("menu-action", (_, action) => {
	const menus = Menu.getApplicationMenu();
	if (!menus) return;
	const menu = menus.getMenuItemById(action);
	if (!menu) return;
	const submenu = menu.submenu;
	if (!submenu) return;
	submenu.popup();
});

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

app.on("open-url", (_, url) => {
	handleDeepLink(url);
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		updaterService?.cancelUpdateDownload();
		app.exit(0);
	}
});

app.on("before-quit", () => {
	if (mainWindow) {
		mainWindow.removeAllListeners("close");
		mainWindow.destroy();
	}
});

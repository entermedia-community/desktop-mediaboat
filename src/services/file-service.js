const fs = require("node:fs");
const OS = require("node:os");
const path = require("node:path");
const { parse: parseURL } = require("node:url");

function createFileService({
	app,
	ipcMain,
	dialog,
	shell,
	eDownload,
	getMainWindow,
	getCurrentWorkDirectory,
	getStore,
	readDirectory,
	getDirectoryStats,
	log,
	error,
}) {
	function openFile(filePath) {
		log("Opening: " + filePath);
		try {
			if (!fs.existsSync(filePath)) {
				error("File not found: " + filePath);
				return;
			}
			shell.openPath(filePath).then((err) => {
				if (err) {
					error(err);
				}
			});
		} catch {
			error("Failed to open the file: " + filePath);
		}
	}

	function openFolder(folderPath) {
		log("Opening folder: " + folderPath);
		try {
			if (!fs.existsSync(folderPath)) {
				fs.mkdirSync(folderPath, { recursive: true }, (err) => {
					if (err) error(err);
				});
			}
			shell.openPath(folderPath);
		} catch {
			error("Error reading directory: " + folderPath);
		}
	}

	function registerIpcHandlers() {
		ipcMain.on("fetchFiles", (_, options) => {
			if (!options["categorypath"]) {
				return;
			}
			const fetchpath = path.join(
				getCurrentWorkDirectory(),
				options["categorypath"],
			);
			if (!fs.existsSync(fetchpath)) {
				fs.mkdirSync(fetchpath, { recursive: true });
			}
			const data = readDirectory(fetchpath, true);
			data.filedownloadpath = fetchpath;
			getMainWindow().webContents.send("files-fetched", {
				...options,
				...data,
			});
		});

		ipcMain.on("openFile", (_, options) => {
			if (
				!options["path"].startsWith("/") &&
				!options["path"].match(/^[a-zA-Z]:/)
			) {
				options["path"] = path.join(getCurrentWorkDirectory(), options["path"]);
			}
			openFile(options["path"]);
		});

		ipcMain.on(
			"openFileWithDefault",
			(_, { categorypath, filename, dlink }) => {
				const store = getStore();
				const filePath = path.join(
					getCurrentWorkDirectory(),
					categorypath,
					filename,
				);
				if (fs.existsSync(filePath)) {
					openFile(filePath);
				} else {
					let downloadLink = dlink;
					if (!downloadLink.startsWith("http:")) {
						const parsedUrl = parseURL(store.get("homeUrl"), true);
						downloadLink =
							parsedUrl.protocol + "//" + parsedUrl.host + downloadLink;
					}
					log("File doesn't exist. Downloading from: " + downloadLink);
					eDownload(getMainWindow(), downloadLink, {
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
			},
		);

		ipcMain.on(
			"openFolder",
			(_, { customRoot, folderPath, dropFromFolderPath = null }) => {
				let rootDir = getCurrentWorkDirectory();
				if (customRoot && customRoot.length > 0) {
					if (customRoot.startsWith("$HOME")) {
						customRoot = customRoot.replace("$HOME", OS.homedir());
					}
					customRoot = path.normalize(customRoot);
					rootDir = customRoot;
				}

				let normalizedFolderPath = path.normalize(folderPath);
				let normalizedDropPath = dropFromFolderPath;
				if (normalizedDropPath) {
					normalizedDropPath = path.normalize(normalizedDropPath);
					if (normalizedFolderPath.startsWith(normalizedDropPath)) {
						normalizedFolderPath = path.relative(
							normalizedDropPath,
							normalizedFolderPath,
						);
					}
				}

				if (
					!normalizedFolderPath.startsWith("/") &&
					!normalizedFolderPath.match(/^[a-zA-Z]:/)
				) {
					normalizedFolderPath = path.join(rootDir, normalizedFolderPath);
				}
				openFolder(normalizedFolderPath);
			},
		);

		ipcMain.on("onOpenFile", (_, fileInfo) => {
			const downloadpath = app.getPath("downloads");
			openFile(path.join(downloadpath, fileInfo.itemexportname));
		});

		ipcMain.on("readDir", (_, { path: targetPath }) => {
			const files = readDirectory(targetPath);
			log("Received files from main process:", files);
		});

		ipcMain.on("directDownload", (_, url) => {
			getMainWindow().webContents.downloadURL(url);
		});

		ipcMain.on("select-dirs", async (_, arg) => {
			const result = await dialog.showOpenDialog(getMainWindow(), {
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
			getMainWindow().webContents.send("selected-dirs", folders);
		});

		ipcMain.on("dir-picker", async (_, arg) => {
			const result = await dialog.showOpenDialog(getMainWindow(), {
				properties: ["openDirectory", "createDirectory"],
				defaultPath: arg.currentPath,
			});
			const rootPath = result.filePaths[0];
			getMainWindow().webContents.send("dir-picked", {
				path: rootPath,
				targetDiv: arg.targetDiv,
			});
		});
	}

	return {
		openFile,
		openFolder,
		registerIpcHandlers,
	};
}

module.exports = {
	createFileService,
};

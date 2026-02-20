const fs = require("node:fs");
const path = require("node:path");
const { parse: parseURL } = require("node:url");
const { randomUUID } = require("node:crypto");

const axios = require("axios");
const FormData = require("form-data");
const mime = require("mime-types");
const { got, AbortError } = require("got-cjs");
const { download: eDownload, CancelError } = require("electron-dl");

function createSyncService({
	ipcMain,
	getMainWindow,
	getStore,
	getCurrentWorkDirectory,
	getMediaDbUrl,
	getConnectionOptions,
	openFolder,
	log,
	error,
	constants,
	fsUtils,
}) {
	const {
		SYNC_PROGRESS_UPDATE,
		SYNC_FOLDER_DELETED,
		SYNC_CANCELLED,
		SYNC_STARTED,
		SYNC_FOLDER_COMPLETED,
		SYNC_FULLY_COMPLETED,
		FILE_PROGRESS_UPDATE,
		FILE_STATUS_UPDATE,
		CHECK_SYNC,
		SYNC_NOT_FOUND,
	} = constants;

	const {
		clipTextMiddle,
		getFilesByDirectory,
		addExtraFoldersToList,
		getFoldersFromPath,
	} = fsUtils;

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

	async function uploadFilesRecursive(
		files,
		{ identifier, oldCount, oldSize, currentFolderSize },
		onFinished,
	) {
		let currentFileIndex = 0;
		const totalFiles = files.length;
		let completedFiles = parseInt(oldCount, 10);
		let completedSize = parseInt(oldSize, 10);
		let failedFiles = 0;

		if (totalFiles === 0) {
			onFinished({
				success: true,
				completed: completedFiles,
				completedSize,
				failed: 0,
				total: 0,
				identifier,
			});
			return;
		}

		const updateOverallProgress = () => {
			getMainWindow().webContents.send(SYNC_PROGRESS_UPDATE, {
				completed: completedFiles,
				completedSize,
				failed: failedFiles,
				total: totalFiles,
				identifier,
				currentFolderSize,
			});
		};

		updateOverallProgress();

		const processNextFile = async () => {
			if (cancelledUploads[identifier]) {
				onFinished({
					success: true,
					cancelled: true,
					completed: completedFiles,
					completedSize,
				});
				return;
			}

			if (currentFileIndex >= totalFiles) {
				onFinished({
					success: true,
					completed: completedFiles,
					completedSize,
					failed: failedFiles,
					total: totalFiles,
					identifier,
				});
				return;
			}

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

			getMainWindow().webContents.send(FILE_STATUS_UPDATE, {
				...fileStatusPayload,
				status: "uploading",
				progress: 0,
			});

			const jsonrequest = {
				sourcepath: currentFile.sourcePath.replaceAll(path.sep, path.posix.sep),
				filesize: currentFile.size,
				id: "",
			};

			const formData = new FormData();
			formData.append("jsonrequest", JSON.stringify(jsonrequest));
			const fileStream = fs.createReadStream(currentFile.path);
			formData.append("file", fileStream, { filename: currentFile.name });

			let lastProgressUpdate = 0;

			try {
				await got
					.post(getMediaDbUrl("services/module/asset/create"), {
						body: formData,
						headers: {
							...formData.getHeaders(),
							...getConnectionOptions().headers,
						},
						signal: uploadAbortControllers[identifier].signal,
					})
					.on("uploadProgress", (progress) => {
						if (Date.now() - lastProgressUpdate < 500) return;
						lastProgressUpdate = Date.now();
						getMainWindow().webContents.send(FILE_PROGRESS_UPDATE, {
							...fileStatusPayload,
							loaded: progress.transferred,
							total: progress.total,
							percent: progress.percent,
						});
					});

				completedFiles++;
				completedSize += currentFile.size;
				getMainWindow().webContents.send(FILE_STATUS_UPDATE, {
					...fileStatusPayload,
					status: "completed",
					progress: 100,
				});
			} catch (err) {
				failedFiles++;
				getMainWindow().webContents.send(FILE_STATUS_UPDATE, {
					...fileStatusPayload,
					status: "failed",
					error: err.message,
				});
				if (err instanceof AbortError) {
					return;
				}
				error(`Error uploading file ${currentFile.name}:`);
			}

			updateOverallProgress();
			currentFileIndex++;
			setTimeout(processNextFile);
		};

		processNextFile();
	}

	async function cancelSync({ identifier, isDownload = false }, onCancelled) {
		if (isDownload) {
			cancelledDownloads[identifier] = true;
			downloadAbortControllers[identifier]?.cancel?.();
			delete downloadAbortControllers[identifier];
		} else {
			cancelledUploads[identifier] = true;
			uploadAbortControllers[identifier]?.abort?.();
			delete uploadAbortControllers[identifier];
		}
		await axios.post(
			getMediaDbUrl("services/module/asset/entity/desktopsynccancel.json"),
			{ syncfolderid: identifier },
			{ headers: getConnectionOptions().headers },
		);
		if (onCancelled) onCancelled();
	}

	async function fetchSubFolderContent(
		categorypath,
		callback,
		syncfolderid,
		extras = false,
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
		const url = getMediaDbUrl(
			"services/module/asset/entity/pullfolderlist.json",
		);
		try {
			const res = await axios.post(
				url,
				{ categorypath },
				{ headers: getConnectionOptions().headers },
			);

			if (res.data !== undefined) {
				const cats = res.data.categories;
				if (cats && cats.length >= 0) {
					cats.forEach((cat) => {
						const dir = path.join(getCurrentWorkDirectory(), cat.path);
						if (!fs.existsSync(dir)) {
							fs.mkdirSync(dir, { recursive: true });
						}
						categories.push(cat);
					});

					if (extras) {
						addExtraFoldersToList(
							categories,
							categorypath,
							getCurrentWorkDirectory(),
						);
					}

					callback(categories, syncfolderid);
				}
			}
		} catch (err) {
			error("Error loading: " + url);
			error(err);
		}
	}

	async function downloadFilesRecursive(
		files,
		{ identifier, skippedCount, skippedSize, currentFolderSize },
		onFinished,
	) {
		let currentFileIndex = 0;
		const totalFiles = files.length;
		let completedFiles = parseInt(skippedCount, 10);
		let completedSize = skippedSize;
		let failedFiles = 0;

		if (totalFiles === 0) {
			onFinished({
				success: true,
				completed: completedFiles,
				completedSize,
				failed: 0,
				total: 0,
				identifier,
				isDownload: true,
			});
			return;
		}

		const updateOverallProgress = () => {
			getMainWindow().webContents.send(SYNC_PROGRESS_UPDATE, {
				completed: completedFiles,
				completedSize,
				failed: failedFiles,
				total: totalFiles,
				identifier,
				isDownload: true,
				currentFolderSize,
			});
		};

		updateOverallProgress();

		const processNextFile = async () => {
			if (cancelledDownloads[identifier]) {
				onFinished({
					success: true,
					cancelled: true,
					completed: completedFiles,
					completedSize,
					isDownload: true,
				});
				return;
			}

			if (currentFileIndex >= totalFiles) {
				onFinished({
					success: true,
					completed: completedFiles,
					completedSize,
					failed: failedFiles,
					total: totalFiles,
					identifier,
					isDownload: true,
				});
				return;
			}

			const currentFile = files[currentFileIndex];
			currentFile.mime = mime.lookup(currentFile.name);

			const fileStatusPayload = {
				index: currentFileIndex,
				name: clipTextMiddle(currentFile.name),
				size: currentFile.size,
				identifier,
			};

			getMainWindow().webContents.send(FILE_STATUS_UPDATE, {
				...fileStatusPayload,
				status: "downloading",
				progress: 0,
				isDownload: true,
			});

			let lastProgressUpdate = 0;

			try {
				await eDownload(getMainWindow(), currentFile.url, {
					directory: currentFile.saveTo,
					onStarted: (item) => {
						downloadAbortControllers[identifier] = item;
					},
					onProgress: (progress) => {
						if (Date.now() - lastProgressUpdate < 500) return;
						lastProgressUpdate = Date.now();
						getMainWindow().webContents.send(FILE_PROGRESS_UPDATE, {
							...fileStatusPayload,
							loaded: progress.transferredBytes,
							total: progress.totalBytes,
							percent: progress.percent,
							isDownload: true,
						});
					},
					onCompleted: () => {
						completedFiles++;
						completedSize += currentFile.size;
						getMainWindow().webContents.send(FILE_STATUS_UPDATE, {
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
				if (!(err instanceof CancelError)) {
					failedFiles++;
					getMainWindow().webContents.send(FILE_STATUS_UPDATE, {
						...fileStatusPayload,
						status: "failed",
						error: err.message,
						isDownload: true,
					});
					error(`Error downloading file ${currentFile.name}:`);
				}
			}

			updateOverallProgress();
			currentFileIndex++;
			setTimeout(processNextFile);
		};

		processNextFile();
	}

	async function uploadLightbox(folders, identifier) {
		if (!identifier || folders.length === 0) {
			return;
		}

		const fetchFilesToUpload = async (uploadFolders, index = 0) => {
			if (cancelledUploads[identifier]) {
				getMainWindow().webContents.send(SYNC_FOLDER_COMPLETED, {
					identifier,
					success: true,
					cancelled: true,
				});
				return;
			}

			if (index >= uploadFolders.length) {
				delete uploadAbortControllers[identifier];
				delete cancelledUploads[identifier];
				let categoryPath = null;
				try {
					const res = await axios.post(
						getMediaDbUrl(
							"services/module/asset/entity/desktopsynccomplete.json",
						),
						{ syncfolderid: identifier },
						{ headers: getConnectionOptions().headers },
					);
					if (res.data !== undefined) {
						const syncfolder = res.data.data;
						categoryPath = syncfolder.categorypath;
					}
				} catch (err) {
					error(err);
				}
				getMainWindow().webContents.send(SYNC_FULLY_COMPLETED, {
					identifier,
					categoryPath,
					success: true,
					isDownload: false,
				});
				return;
			}

			const filesToUpload = [];
			let totalCount = 0;
			let totalSize = 0;
			let addedCount = 0;
			let addedSize = 0;

			const folder = uploadFolders[index];
			const fetchPath = path.join(getCurrentWorkDirectory(), folder.path);

			try {
				const res = await axios.post(
					getMediaDbUrl("services/module/asset/entity/pullpendingfiles.json"),
					{
						files: getFilesByDirectory(fetchPath),
						categorypath: folder.path,
						syncfolderid: identifier,
						isdownload: false,
					},
					{ headers: getConnectionOptions().headers },
				);

				if (res.data !== undefined && res.data.response.status === "ok") {
					const ftu = res.data.filestoupload;
					addedCount = res.data.addedcount || 0;
					addedSize = res.data.addedsize || 0;
					totalCount = res.data.totalcount || 0;
					totalSize = res.data.totalsize || 0;
					if (ftu !== undefined) {
						ftu.forEach((file) => {
							const filePath = path.join(fetchPath, file.path);
							filesToUpload.push({
								path: filePath,
								name: path.basename(filePath),
								size: parseInt(file.size, 10),
								sourcePath: path.join(folder.path, file.path),
							});
						});
					}
				} else {
					log(res.data);
				}
			} catch (err) {
				error("Error on upload/Lightbox: " + folder.path);
				error(err);
			}

			getMainWindow().webContents.send(SYNC_STARTED, {
				total: filesToUpload.length,
				identifier,
				isDownload: false,
				currentFolder: folder.name,
				currentFolderSize: totalSize,
			});

			await uploadFilesRecursive(
				filesToUpload,
				{
					identifier,
					oldCount: totalCount - addedCount,
					oldSize: totalSize - addedSize,
				},
				async (uploadSummary) => {
					if (uploadSummary.success) {
						getMainWindow().webContents.send(SYNC_FOLDER_COMPLETED, {
							...uploadSummary,
							currentFolder: folder.name,
							currentFolderSize: totalSize,
						});
					}

					await fetchFilesToUpload(uploadFolders, index + 1);
				},
			);
		};

		await fetchFilesToUpload(folders);
	}

	async function downloadLightbox(folders, identifier) {
		if (!identifier || folders.length === 0) {
			return;
		}

		const downloadURLRoot = parseURL(getStore().get("homeUrl"), true);

		const fetchFilesToDownload = async (downloadFolders, index) => {
			if (cancelledDownloads[identifier]) {
				getMainWindow().webContents.send(SYNC_FOLDER_COMPLETED, {
					identifier,
					success: true,
					cancelled: true,
					isDownload: true,
				});
				return;
			}

			if (index >= downloadFolders.length) {
				delete downloadAbortControllers[identifier];
				delete cancelledDownloads[identifier];
				let categoryPath = null;
				try {
					const res = await axios.post(
						getMediaDbUrl(
							"services/module/asset/entity/desktopsynccomplete.json",
						),
						{ syncfolderid: identifier },
						{ headers: getConnectionOptions().headers },
					);
					if (res.data !== undefined) {
						const syncfolder = res.data.data;
						categoryPath = syncfolder.categorypath;
					}
				} catch (err) {
					error(err);
				}
				getMainWindow().webContents.send(SYNC_FULLY_COMPLETED, {
					identifier,
					categoryPath,
					success: true,
					isDownload: true,
				});
				if (categoryPath) {
					openFolder(path.join(getCurrentWorkDirectory(), categoryPath));
				}
				return;
			}

			const filesToDownload = [];
			let currentFolderSize = 0;
			let skippedCount = 0;
			let skippedSize = 0;

			const folder = downloadFolders[index];
			const fetchPath = path.join(getCurrentWorkDirectory(), folder.path);

			try {
				const res = await axios.post(
					getMediaDbUrl("services/module/asset/entity/pullpendingfiles.json"),
					{
						files: getFilesByDirectory(fetchPath),
						categorypath: folder.path,
						syncfolderid: identifier,
						isdownload: true,
					},
					{ headers: getConnectionOptions().headers },
				);

				if (res.data !== undefined && res.data.response.status === "ok") {
					const ftd = res.data.filestodownload;
					skippedCount = res.data.skippedcount || 0;
					skippedSize = res.data.skippedsize || 0;
					currentFolderSize = res.data.totalsize || 0;
					if (ftd !== undefined) {
						ftd.forEach((file) => {
							const filePath = path.join(fetchPath, file.path);
							filesToDownload.push({
								path: filePath,
								name: path.basename(filePath),
								size: parseInt(file.size, 10),
								url:
									downloadURLRoot.protocol +
									"//" +
									downloadURLRoot.host +
									file.url,
								saveTo: fetchPath,
							});
						});
					}
				} else {
					log(res.data);
				}
			} catch (err) {
				error("Error on download/Lightbox: " + folder.path);
				error(err);
			}

			getMainWindow().webContents.send(SYNC_STARTED, {
				total: filesToDownload.length,
				identifier,
				isDownload: true,
				currentFolder: folder.name,
				currentFolderSize,
			});

			await downloadFilesRecursive(
				filesToDownload,
				{ identifier, skippedCount, skippedSize, currentFolderSize },
				async (downloadSummary) => {
					if (downloadSummary.success) {
						getMainWindow().webContents.send(SYNC_FOLDER_COMPLETED, {
							...downloadSummary,
							currentFolder: folder.name,
							currentFolderSize,
						});
					}
					fetchFilesToDownload(downloadFolders, index + 1);
				},
			);
		};

		await fetchFilesToDownload(folders, 0);
	}

	function isValidDownload(identifier) {
		if (downloadAbortControllers[identifier] !== undefined) {
			return false;
		}
		const identifiers = Object.keys(downloadAbortControllers);
		for (let i = 0; i < identifiers.length; i++) {
			const identifier2 = identifiers[i];
			if (identifier === identifier2) return false;
			if (identifier.startsWith(identifier2)) return false;
			if (identifier2.startsWith(identifier)) return false;
		}
		return true;
	}

	function isValidUpload(identifier) {
		if (uploadAbortControllers[identifier] !== undefined) return false;
		const ongoing = Object.keys(uploadAbortControllers);
		for (let i = 0; i < ongoing.length; i++) {
			if (identifier === ongoing[i]) return false;
			if (identifier.startsWith(ongoing[i])) return false;
			if (ongoing[i].startsWith(identifier)) return false;
		}
		return true;
	}

	function handleLightboxDownload(categoryPath, syncFolderId) {
		if (Object.keys(downloadAbortControllers).length > 3) {
			return "TOO_MANY_DOWNLOADS";
		}
		if (!isValidDownload(syncFolderId)) {
			return "DUPLICATE_DOWNLOAD";
		}
		downloadAbortControllers[syncFolderId] = true;
		log("Syncing Down: " + categoryPath);
		fetchSubFolderContent(categoryPath, downloadLightbox, syncFolderId);
		return "OK";
	}

	function handleLightboxUpload(categoryPath, syncFolderId) {
		if (Object.keys(uploadAbortControllers).length > 3) {
			return "TOO_MANY_UPLOADS";
		}
		if (!isValidUpload(syncFolderId)) {
			return "DUPLICATE_UPLOAD";
		}
		uploadAbortControllers[syncFolderId] = true;
		log("Syncing Up: " + categoryPath);
		fetchSubFolderContent(categoryPath, uploadLightbox, syncFolderId, true);
		return "OK";
	}

	function registerIpcHandlers() {
		ipcMain.on("cancelSync", (_, { identifier, isDownload }) => {
			cancelSync({ identifier, isDownload }, () => {
				getMainWindow().webContents.send(SYNC_CANCELLED, {
					identifier,
					isDownload,
				});
			});
		});

		ipcMain.on("deleteSync", (_, { identifier, isDownload, delId }) => {
			cancelSync({ identifier, isDownload }, () => {
				axios
					.delete(
						getMediaDbUrl("services/module/desktopsyncfolder/data/" + delId),
						{
							headers: getConnectionOptions().headers,
						},
					)
					.then(() => {
						getMainWindow().webContents.send(SYNC_FOLDER_DELETED, {
							delId,
							isDownload,
						});
					})
					.catch((err) => {
						getMainWindow().webContents.send(SYNC_FOLDER_DELETED, {
							delId,
							success: false,
						});
						error(err);
					});
			});
		});

		ipcMain.on(CHECK_SYNC, (_, { syncFolderId, isDownload }) => {
			if (isDownload) {
				if (!downloadAbortControllers[syncFolderId]) {
					getMainWindow().webContents.send(SYNC_NOT_FOUND, {
						identifier: syncFolderId,
						isDownload,
					});
				}
			} else {
				if (!uploadAbortControllers[syncFolderId]) {
					getMainWindow().webContents.send(SYNC_NOT_FOUND, {
						identifier: syncFolderId,
						isDownload,
					});
				}
			}
		});

		ipcMain.on(
			"dropUpload",
			async (_, { folderPath, categoryPath, syncFolderId: identifier }) => {
				if (!identifier) {
					return;
				}
				const cats = getFoldersFromPath(folderPath, categoryPath);
				const categories = [
					{
						index: 0,
						id: randomUUID(),
						name: path.basename(categoryPath),
						path: categoryPath,
					},
					...cats,
				];

				const fetchFilesToUpload = async (folders, index = 0) => {
					if (cancelledUploads[identifier]) {
						getMainWindow().webContents.send(SYNC_FOLDER_COMPLETED, {
							identifier,
							success: true,
							cancelled: true,
							isDownload: true,
						});
						return;
					}
					if (index >= folders.length) {
						delete uploadAbortControllers[identifier];
						delete cancelledUploads[identifier];
						let catPath = null;
						try {
							const res = await axios.post(
								getMediaDbUrl(
									"services/module/asset/entity/desktopsynccomplete.json",
								),
								{ syncfolderid: identifier },
								{ headers: getConnectionOptions().headers },
							);
							if (res.data !== undefined) {
								const syncfolder = res.data.data;
								catPath = syncfolder.categorypath;
							}
						} catch (err) {
							error(err);
						}
						getMainWindow().webContents.send(SYNC_FULLY_COMPLETED, {
							identifier,
							categoryPath: catPath,
							success: true,
							isDownload: false,
						});
						return;
					}
					const folder = folders[index];
					const fetchPath = path.join(
						folderPath,
						path.relative(categoryPath, folder.path),
					);

					const filesToUpload = [];
					const ftu = getFilesByDirectory(fetchPath);
					let currentFolderSize = 0;
					ftu.forEach((file) => {
						const filePath = path.join(fetchPath, file.path);
						filesToUpload.push({
							path: filePath,
							name: path.basename(filePath),
							size: file.size,
							sourcePath: path.join(folder.path, file.path),
						});
						currentFolderSize += file.size;
					});

					getMainWindow().webContents.send(SYNC_STARTED, {
						total: filesToUpload.length,
						identifier,
						isDownload: false,
						currentFolder: folder.name,
						currentFolderSize,
					});

					await uploadFilesRecursive(
						filesToUpload,
						{
							identifier,
							oldCount: 0,
							oldSize: 0,
							currentFolderSize,
						},
						async (uploadSummary) => {
							if (uploadSummary.success) {
								getMainWindow().webContents.send(SYNC_FOLDER_COMPLETED, {
									...uploadSummary,
									currentFolder: folder.name,
									currentFolderSize,
								});
							}

							await fetchFilesToUpload(folders, index + 1);
						},
					);
				};

				await fetchFilesToUpload(categories);
			},
		);

		ipcMain.handle(
			"lightboxDownload",
			async (_, { categoryPath, syncFolderId }) => {
				return handleLightboxDownload(categoryPath, syncFolderId);
			},
		);

		ipcMain.handle(
			"lightboxUpload",
			async (_, { categoryPath, syncFolderId }) => {
				return handleLightboxUpload(categoryPath, syncFolderId);
			},
		);
	}

	return {
		registerIpcHandlers,
		resetMemory,
		handleLightboxDownload,
		handleLightboxUpload,
		cancelSync,
	};
}

module.exports = {
	createSyncService,
};

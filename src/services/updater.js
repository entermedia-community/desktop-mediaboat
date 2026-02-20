const OS = require("node:os");
const { shell, dialog, app } = require("electron/main");
const axios = require("axios");
const { download: eDownload } = require("electron-dl");

function compareVersions(v1, v2) {
	const parsedV1 = parseInt(v1.replace(/[^0-9]/g, ""), 10);
	const parsedV2 = parseInt(v2.replace(/[^0-9]/g, ""), 10);
	return parsedV1 - parsedV2;
}

function createUpdaterService({
	getMainWindow,
	getCurrentVersion,
	onUpdateStateChange,
	logError,
}) {
	let updateDownloader = null;

	const setUpdateDownloader = (downloader) => {
		updateDownloader = downloader;
		if (onUpdateStateChange) {
			onUpdateStateChange(updateDownloader);
		}
	};

	async function checkForUpdates(silentCheck = false) {
		const updateUrl = "https://emedialibrary.com/releases.json";

		axios
			.get(updateUrl)
			.then((res) => {
				const mainWindow = getMainWindow();
				if (!res.data || !res.data.version) {
					if (silentCheck) return;
					dialog.showMessageBox(mainWindow, {
						type: "info",
						title: "Check for Updates",
						message: "You are using the latest version.",
					});
					return;
				}
				const latestVersion = res.data.version;
				const currentVersion = getCurrentVersion();
				if (compareVersions(latestVersion, currentVersion) > 0) {
					const downloads = res.data.downloads || {};
					let downloadUrl = null;
					if (OS.platform() === "win32" && downloads.windows) {
						downloadUrl = downloads.windows.amd || null;
					} else if (OS.platform() === "darwin" && downloads.apple) {
						if (OS.arch() === "arm64") {
							downloadUrl = downloads.apple.arm || null;
						} else {
							downloadUrl = downloads.apple.amd || null;
						}
					} else if (OS.platform() === "linux" && downloads.linux) {
						downloadUrl = downloads.linux.amd || null;
					}

					dialog
						.showMessageBox(mainWindow, {
							type: "info",
							title: "Update Available",
							message: `A new version (${latestVersion}) is available.`,
							detail: `You are using ${currentVersion}.`,
							buttons: ["Download", "Later"],
							defaultId: 0,
						})
						.then((result) => {
							if (result.response === 0 && downloadUrl) {
								eDownload(mainWindow, downloadUrl, {
									directory: app.getPath("downloads"),
									onStarted: (item) => {
										setUpdateDownloader(item);
									},
									onCompleted: (file) => {
										dialog
											.showMessageBox(mainWindow, {
												type: "info",
												title: "Update Downloaded",
												message: "Update downloaded to Downloads folder.",
												detail:
													"Exiting will cancel any download or update in progress.",
												buttons: ["Exit & Install", "Later"],
												defaultId: 0,
											})
											.then((res2) => {
												if (res2.response === 0) {
													shell
														.openPath(file.path)
														.then((err) => {
															if (err) {
																logError(err);
															} else {
																setTimeout(() => {
																	app.isQuitting = true;
																	app.quit();
																}, 1000);
															}
														})
														.catch((err) => {
															logError(err);
														});
												}
											});
										setUpdateDownloader(null);
									},
									onCancel: () => {
										setUpdateDownloader(null);
									},
								}).catch((err) => {
									setUpdateDownloader(null);
									logError("Error downloading update: ");
									logError(err);
									dialog
										.showMessageBox(mainWindow, {
											type: "error",
											title: "Update Download",
											message:
												"Error downloading the update. Please try again later.",
											buttons: ["Download Manually", "Close"],
											defaultId: 0,
										})
										.then((res2) => {
											if (res2.response === 0 && downloadUrl) {
												shell.openExternal(downloadUrl);
											}
										});
								});
							}
						});
				} else {
					if (silentCheck) return;
					dialog.showMessageBox(mainWindow, {
						type: "info",
						title: "Check for Updates",
						message: "You are using the latest version.",
					});
				}
			})
			.catch((err) => {
				if (silentCheck) return;
				logError("Error checking for updates: ");
				logError(err);
				dialog.showMessageBox(mainWindow, {
					type: "error",
					title: "Check for Updates",
					message: "Error checking for updates. Please try again later.",
				});
			});
	}

	return {
		checkForUpdates,
		compareVersions,
		getUpdateDownloader: () => updateDownloader,
		cancelUpdateDownload: () => {
			if (updateDownloader) {
				updateDownloader.cancel();
			}
		},
	};
}

module.exports = {
	compareVersions,
	createUpdaterService,
};

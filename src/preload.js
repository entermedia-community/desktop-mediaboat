const { ipcRenderer, webUtils } = require("electron");

process.once("loaded", () => {
	window.addEventListener("message", (evt) => {
		if (evt.data.type === "select-dirs") {
			ipcRenderer.send("select-dirs", {
				currentPath: evt.data.currentPath || undefined,
			});
		} else if (evt.data.type === "dir-picker") {
			ipcRenderer.send("dir-picker", {
				targetDiv: evt.data.targetDiv,
				currentPath: evt.data.currentPath || undefined,
			});
		}
	});
});

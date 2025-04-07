"use strict";

const builder = require("electron-builder");
const Platform = builder.Platform;

const options = {
	protocols: {
		name: "eMedia Desktop",
		schemes: ["emedia"],
	},

	linux: {
		desktop: {
			StartupNotify: "false",
			Encoding: "UTF-8",
			MimeType: "x-scheme-handler/emedia",
		},
		target: ["deb", "rpm"],
	},
};

let platformTarget = Platform.MAC.createTarget();
if (process.platform === "linux") {
	platformTarget = Platform.LINUX.createTarget();
} else if (process.platform === "win32") {
	platformTarget = Platform.WINDOWS.createTarget();
}

builder
	.build({
		targets: platformTarget,
		config: options,
	})
	.then((result) => {
		console.log(JSON.stringify(result));
	})
	.catch((error) => {
		console.error(error);
	});

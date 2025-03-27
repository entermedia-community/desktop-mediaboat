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

builder
	.build({
		targets: Platform.MAC.createTarget(),
		config: options,
	})
	.then((result) => {
		console.log(JSON.stringify(result));
	})
	.catch((error) => {
		console.error(error);
	});

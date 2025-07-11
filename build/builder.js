"use strict";
require("dotenv").config();
const builder = require("electron-builder");
const notarizeMacOS = "./notarize";
const Platform = builder.Platform;

const options = {
	compression: "store",
	productName: "eMedia Library",
	appId: "com.emedialibrary",
	afterSign: async (context) => {
		if (context.electronPlatformName === "darwin") {
			await notarizeMacOS(context);
		}
	},
	mac: {
		target: "dmg",
		hardenedRuntime: true,
		gatekeeperAssess: true,
		category: "public.app-category.utilities",
		entitlements: "./mac.plist",
		entitlementsInherit: "./mac.plist",
	},
	dmg: {
		sign: true,
	},
	protocols: {
		name: "eMedia Desktop",
		schemes: ["emedia"],
	},
	linux: {
		target: ["deb", "rpm"],
		desktop: {
			StartupNotify: "false",
			Encoding: "UTF-8",
			MimeType: "x-scheme-handler/emedia",
		},
	},
};

let platformTarget = null;
if (process.platform === "darwin") {
	platformTarget = Platform.MAC.createTarget();
} else if (process.platform === "linux") {
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

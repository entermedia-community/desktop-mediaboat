"use strict";
require("dotenv").config();
const builder = require("electron-builder");
const { build } = require("../package.json");
const Platform = builder.Platform;

const options = {
	productName: "eMedia Library",
	appId: "com.emedialibrary",
	mac: {
		category: "public.app-category.utilities",
		hardenedRuntime: true,
		entitlements: "./mac.plist",
		entitlementsInherit: "./mac.plist",
		gatekeeperAssess: false,
		target: [
			{
				target: "dmg",
				arch: ["x64", "arm64"],
			},
		],
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

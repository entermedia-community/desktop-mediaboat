const appleCredentials =
	process.platform === "darwin" ? require("./apple-credentials.json") : {};

module.exports = {
	packagerConfig: {
		name: "eMedia Library",
		asar: true,
		osxSign: {},
		osxNotarize: {
			appleId: appleCredentials.APPLE_ID,
			appleIdPassword: appleCredentials.APPLE_APP_SPECIFIC_PASSWORD,
			teamId: appleCredentials.APPLE_TEAM_ID,
		},
		appCategoryType: "public.app-category.utilities",
		appBundleId: "com.emedialibrary",
		icon: "./build/icon",
		executableName: "emedia-library",
	},
	makers: [
		{
			name: "@electron-forge/maker-dmg",
			config: {
				icon: "./build/icon.icns",
			},
		},
		{
			name: "@electron-forge/maker-deb",
			executableName: "emedia-library",
			config: {
				options: {
					icon: "./build/icon.png",
					categories: ["Development", "Utility"],
					name: "emedia-library",
					productName: "emedia-library",
				},
			},
		},
		{
			name: "@electron-forge/maker-squirrel",
			config: {
				setupIcon: "./build/icon.ico",
			},
		},
	],
	rebuildConfig: {
		force: true,
	},
};

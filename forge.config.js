module.exports = {
	packagerConfig: {
		name: "eMedia Library",
		asar: true,
		osxSign: {},
		osxNotarize: {
			appleId: "tech@entermediadb.org",
			appleIdPassword: "xyte-xtdc-wnzw-tbkb",
			teamId: "VJ8RCF92K4",
		},
		appCategoryType: "public.app-category.utilities",
		appBundleId: "com.emedialibrary",
		icon: "./build/icon",
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
			config: {
				options: {
					icon: "./build/icon.png",
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
};

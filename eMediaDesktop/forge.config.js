require("dotenv").config();

module.exports = {
  packagerConfig: {
    icon: __dirname + "/images/icon",
    asar: true,
    osxSign: {},
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      config: {
        icon: __dirname + "/images/icon.icns",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      config: {
        icon: __dirname + "/images/icon.ico",
      },
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        options: {
          icon: __dirname + "/images/icon.png",
        },
      },
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {
        options: {
          icon: __dirname + "/images/icon.png",
        },
      },
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "entermedia-community",
          name: "desktop-mediaboat",
        },
        prerelease: false,
        draft: true,
      },
    },
  ],
};

const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

require("dotenv").config();

module.exports = {
  packagerConfig: {
    appBundleId: "com.emedialibrary",
    asar: true,
    // all: true,
    icon: __dirname + "/images/icon",
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
      name: "@electron-forge/maker-pkg",
      config: {
        icon: __dirname + "/images/icon.icns",
        identity:
          "3rd Party Mac Developer Installer: EnterMedia Incorporated (VJ8RCF92K4)",
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
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

const fs = require("fs");
const path = require("path");

try {
	fs.readdirSync(path.join(__dirname, "dist")).forEach((file) => {
		if (
			file.endsWith(".dmg") ||
			file.endsWith(".exe") ||
			file.endsWith(".app") ||
			file.endsWith(".zip") ||
			file.endsWith(".deb") ||
			file.endsWith(".blockmap")
		) {
			fs.unlinkSync(path.join(__dirname, "dist", file));
		}
	});
} catch (error) {}

return true;

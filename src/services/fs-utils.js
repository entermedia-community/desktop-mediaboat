const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function clipTextMiddle(text, maxLength = 100) {
	if (text.length <= maxLength) {
		return text;
	}

	const charsPerSide = Math.floor((maxLength - 3) / 2);
	const leftSide = text.substring(0, charsPerSide);
	const rightSide = text.substring(text.length - charsPerSide);

	return leftSide + "..." + rightSide;
}

function getDirectoryStats(dirPath) {
	let totalFiles = 0;
	let totalFolders = -1;
	let totalSize = 0;

	function traverseDirectory(currentPath) {
		const items = fs.readdirSync(currentPath);
		totalFolders++;
		items.forEach((item) => {
			const ext = path.extname(item).toLowerCase();
			if (item.startsWith(".") || ext === ".ini" || ext === ".db") return;
			const fullPath = path.join(currentPath, item);
			const stats = fs.statSync(fullPath);
			if (stats.isDirectory()) {
				traverseDirectory(fullPath);
			} else if (stats.isFile()) {
				totalFiles++;
				totalSize += stats.size;
			}
		});
	}

	traverseDirectory(dirPath);
	return {
		totalFiles,
		totalFolders,
		totalSize,
	};
}

function getFilesByDirectory(directory) {
	if (!fs.existsSync(directory)) {
		return [];
	}

	const filePaths = [];
	const files = fs.readdirSync(directory);
	files.forEach((file) => {
		const ext = path.extname(file).toLowerCase();
		if (file.startsWith(".") || ext === ".ini" || ext === ".db") return;
		const abspath = path.join(directory, file);
		const stats = fs.statSync(abspath);
		if (!stats.isDirectory()) {
			filePaths.push({
				path: path.basename(abspath),
				size: stats.size,
				abspath,
			});
		}
	});

	return filePaths;
}

function readDirectory(directory, append = false) {
	const filePaths = [];
	const folderPaths = [];
	const files = fs.readdirSync(directory);
	files.forEach((file) => {
		const ext = path.extname(file).toLowerCase();
		if (file.startsWith(".") || ext === ".ini" || ext === ".db") return;
		const filepath = path.join(directory, file);
		const stats = fs.statSync(filepath);
		if (stats.isDirectory()) {
			let subfolderPaths = {};
			if (append) {
				subfolderPaths = readDirectory(filepath, true);
			}
			folderPaths.push({ path: file, subfolders: subfolderPaths });
		} else {
			filePaths.push({ path: file, size: stats.size, abspath: filepath });
		}
	});

	return {
		files: filePaths,
		folders: folderPaths,
	};
}

function addExtraFoldersToList(categories, categoryPath, currentWorkDirectory) {
	const parent = path.join(currentWorkDirectory, categoryPath);
	let idx = categories.length;
	if (!fs.existsSync(parent)) {
		return;
	}
	const files = fs.readdirSync(parent);
	files.forEach((file) => {
		const filePath = path.join(parent, file);
		const stats = fs.statSync(filePath);
		if (stats.isDirectory()) {
			const catPath = path.relative(currentWorkDirectory, filePath);
			const exists = categories.some((cat) => cat.path === catPath);
			if (exists) return;
			categories.push({
				index: idx++,
				id: randomUUID(),
				name: file,
				path: catPath,
			});
		}
	});
}

function getFoldersFromPath(rootPath, categoryPath) {
	if (!fs.existsSync(rootPath)) {
		return [];
	}
	const categories = [];
	let idx = 1;

	function rec(parentPath) {
		const files = fs.readdirSync(parentPath);
		files.forEach((file) => {
			const filePath = path.join(parentPath, file);
			const stats = fs.statSync(filePath);
			if (stats.isDirectory()) {
				const catPath = path.relative(rootPath, filePath);
				categories.push({
					index: idx++,
					id: randomUUID(),
					name: file,
					path: path.join(categoryPath, catPath),
				});
				rec(filePath);
			}
		});
	}

	rec(rootPath);
	return categories;
}

module.exports = {
	clipTextMiddle,
	getDirectoryStats,
	getFilesByDirectory,
	readDirectory,
	addExtraFoldersToList,
	getFoldersFromPath,
};

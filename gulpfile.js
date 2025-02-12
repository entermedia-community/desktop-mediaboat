// `npm i -g gulp-cli`
// start with `gulp`

const { watch } = require("gulp");
const { spawn } = require("child_process");
const fs = require("fs");

let child = null;
let pid = null;

const start = () => {
	if (child) {
		child.stdout.destroy();
		child.stderr.destroy();
		pid = child.pid;
	} else if (fs.existsSync("pid")) {
		try {
			pid = fs.readFileSync("pid").toString();
		} catch (_) {
			console.warn("Error reading PID file");
		}
	}
	if (pid) {
		try {
			process.kill(-pid, "SIGINT");
		} catch (_) {
			console.warn(`No process with PID ${pid}`);
		}
	}

	child = spawn("yarn", ["start"], {
		env: { ...process.env, NODE_ENV: "development" },
		detached: true,
	});
	pid = child.pid;
	try {
		fs.writeFileSync("pid", String(child.pid));
	} catch (_) {
		console.warn("Error writing PID file");
	}

	function print(data) {
		let str = data.toString().trim();
		if (str) console.log(str);
	}

	child.stdout.on("data", print);
	child.stderr.on("data", print);

	watch(["src/*.js"], { events: ["change"] }, function () {
		start();
	});
};

function defaultTask() {
	start();
}

exports.default = defaultTask;

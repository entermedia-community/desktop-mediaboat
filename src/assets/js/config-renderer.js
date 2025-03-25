const { ipcRenderer, shell } = require("electron");

// const extRoot = "http://web.localhost.com:8080/libraries";
const extRoot = "https://emedialibrary.com/libraries";

let hasPrivateLibraries = false;

function renderSaved(url, name, logo, isActive = false) {
	var el = `<div class="library-card ${
		isActive ? "active" : ""
	}" data-url="${url}" title="${url}">`;
	if (logo) {
		el += `<img src="${logo}" alt="${name}" onerror="this.onerror=null;this.src='assets/images/default-logo.png'"/>`;
	}
	el += `<button class="edit">
			<i class="bi bi-pencil-square"></i>
		</button>
		<button class="delete">
			<i class="bi bi-trash"></i>
		</button>`;
	if (name) {
		el += `<h3>${name}</h3>`;
	} else {
		el += `<h4>${url}</h4>`;
	}
	el += "</div>";
	return el;
}

function fetchAndReplace(url, callback, target = "#main") {
	if (!url.startsWith("file://")) {
		url += "&oemaxlevel=1";
	}
	fetch(url)
		.then((response) => {
			if (response.ok) {
				return response.text();
			} else {
				throw new Error(response.status);
			}
		})
		.then((response) => {
			$(target).html(response);
		})
		.then(() => {
			if (callback) callback();
			swapOrder(hasPrivateLibraries);
		})
		.catch((error) => {
			$(target).html(
				`<div class="alert alert-error">Error: ${
					error.message || "Unknown error!"
				}</div>`
			);
		});
}

function loadPrivateConfig() {
	$(".btn-wide").removeClass("active");
	$("#privateLibraries").addClass("active");
	$("#main h2").text("Saved Libraries");
	$(".subheader").text(
		"Add an existing eMedia library or use a free community library"
	);
	$("#privateLibraries").show();
	fetchAndReplace(
		`file://${__dirname}/private-config.html`,
		() => {
			ipcRenderer.send("configInit");
		},
		"#configcontent"
	);
}

function loadCommunityLibraries() {
	$(".btn-wide").removeClass("active");
	$("#communityLibraries").addClass("active");
	$("#configcontent").html('<span class="loader"></span>');
	$(".subheader").text("Select a community library to browse");
	fetchAndReplace(`${extRoot}?tab=communitylibrarylist`);
}

// function loadSandbox() {
// 	$(".btn-wide").removeClass("active");
// 	$("#sandbox").addClass("active");
// 	$("#configcontent").html('<span class="loader"></span>');
// 	$(".subheader").text(
// 		"Try out all the features as an admin in the sandbox library"
// 	);
//  fetchAndReplace(`${extRoot}?tab=sandboxlibrarylist`);
// }

function swapOrder(hasLib) {
	hasPrivateLibraries = hasLib;
	var privateLibraries = $("#privateLibraries");
	var communityLibraries = $("#communityLibraries");
	if (!hasLib) {
		communityLibraries.after(privateLibraries);
	} else {
		communityLibraries.before(privateLibraries);
	}
}
var initialLoad = true;
$(document).ready(function () {
	fetchAndReplace(`${extRoot}?`, function () {
		loadPrivateConfig();
	});
	ipcRenderer.on("config-init", (_, { workspaces, currentUrl = null }) => {
		document.title = "Browse or Add eMedia Libraries";
		workspaces = workspaces.filter((workspace) => workspace.url);
		swapOrder(workspaces.length > 0);
		if (workspaces.length > 0) {
			var saved = $("#savedLibraries");
			saved.empty();
			workspaces.forEach(({ url, name, logo }) => {
				saved.append(renderSaved(url, name, logo, currentUrl === url));
			});
			$(".saved-lib").show();
		} else if (initialLoad) {
			initialLoad = false;
			loadCommunityLibraries();
		}
	});

	$("#main").on("click", "#privateLibraries", function (e) {
		e.preventDefault();
		loadPrivateConfig();
	});

	$("#main").on("click", "#communityLibraries", function (e) {
		e.preventDefault();
		loadCommunityLibraries();
	});

	// $("#main").on("click", "#sandbox", function (e) {
	// 	e.preventDefault();
	// 	loadSandbox();
	// });

	jQuery("#main").on("click", ".edit", function (e) {
		e.stopPropagation();

		var card = $(this).parent();
		var url = card.data("url");
		var name = card.find("h3").text();
		var modal = $("#editLibraryModal");
		modal.find("#formGroupName").val(name);
		modal.find("#formGroupURL").val(url);
		modal.modal("show");
		$("#editLibraryForm").data("url", url);
	});

	jQuery("#main").on("click", ".delete", function (e) {
		e.stopPropagation();

		var card = $(this).parent();
		var url = card.data("url");
		var name = card.find("h3").text();
		var modal = $("#deleteModal");
		modal.find(".dl-name").html(name ? "<b>" + name + "</b>" : "this library");
		$("#deleteLibrary").data("url", url);
		modal.modal("show");
	});

	jQuery("#main").on("click", "#deleteLibrary", function () {
		var url = $(this).data("url");
		if (!url) return;
		ipcRenderer.send("deleteWorkspace", url);
		window.location.reload();
	});

	function upsertLibrary(e) {
		e.preventDefault();
		var name = $(this).find("#formGroupName").val();
		var url = $(this).find("#formGroupURL").val();
		if (!url) {
			alert("Please enter URL");
			return;
		} else {
			if (url.endsWith("index.html")) {
				url = url.substring(0, url.length - 10);
			}
			if (url.endsWith("/")) {
				url = url.substring(0, url.length - 1);
			}
			if (!/find\d?$/.test(url) || !url.startsWith("http")) {
				alert("Please enter a valid eMedia Library URL");
				return;
			}
		}
		var communityLibs = $("#privateLibraries").data("blocked-libs");
		communityLibs = communityLibs.split("|");
		var urlHost = new URL(url).host;
		if (communityLibs.includes(urlHost)) {
			alert(
				"You cannot add a community library here\n\nUse the Community Libraries tab instead"
			);
			return;
		}
		if (!name) {
			alert("Please enter a name for the library");
			return;
		}
		var logo = [url, "theme/lighttheme/logo.png"].join("/");
		var prevUrl = $(this).data("url");
		ipcRenderer.send("upsertWorkspace", { url, name, logo, prevUrl });
	}

	jQuery("#main").on("submit", "#addLibraryForm", upsertLibrary);
	jQuery("#main").on("submit", "#editLibraryForm", upsertLibrary);

	ipcRenderer.on("workspaces-updated", () => {
		window.location.reload();
	});

	jQuery("#main").on("click", ".library-card", function (e) {
		e.stopPropagation();
		var url = $(this).data("url");
		if (!url) return;
		ipcRenderer.send("openWorkspace", url);
	});
});

const { ipcRenderer } = require("electron");

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

function fetchAndReplace(url, callback) {
	fetch(url)
		.then((response) => {
			if (response.ok) {
				return response.text();
			} else {
				throw new Error(response.status);
			}
		})
		.then((response) => {
			$("#configcontent").html(response);
		})
		.then(() => {
			if (callback) callback();
		})
		.catch((error) => {
			$("#configcontent").html(
				`<div class="alert alert-error">Error: ${
					error.message || "Unknown error!"
				}</div>`
			);
		});
}

function loadPrivateConfig() {
	$(".btn-wide").removeClass("active");
	$("#privateLibraries").addClass("active");
	$(".subheader").text(
		"Add an existing eMedia library or use a free community library"
	);
	fetchAndReplace(`file://${__dirname}/private-config.html`, () => {
		ipcRenderer.send("configInit");
	});
}

$("#privateLibraries").click(function () {
	loadPrivateConfig();
});

function loadCommunityLibraries() {
	$(".btn-wide").removeClass("active");
	$("#communityLibraries").addClass("active");
	$("#configcontent").html('<span class="loader"></span>');
	$(".subheader").text("Select a community library to browse");
	fetchAndReplace(
		"https://emedialibrary.com/libraries/communitylibrarylist.html"
	);
}
$("#communityLibraries").click(function () {
	loadCommunityLibraries();
});
function loadSandbox() {
	$(".btn-wide").removeClass("active");
	$("#sandbox").addClass("active");
	$("#configcontent").html('<span class="loader"></span>');
	$(".subheader").text(
		"Try out all the features as an admin in the sandbox library"
	);
	fetchAndReplace(
		"https://emedialibrary.com/libraries/sandboxlibrarylist.html"
	);
}
$("#sandbox").click(function () {
	loadSandbox();
});

$(document).ready(function () {
	loadPrivateConfig();
	ipcRenderer.on("config-init", (_, { workspaces, currentUrl = null }) => {
		document.title = "Browse or Add eMedia Libraries";
		workspaces = workspaces.filter((workspace) => workspace.url);
		if (workspaces.length > 0) {
			var saved = $("#savedLibraries");
			saved.empty();
			workspaces.forEach(({ url, name, logo }) => {
				saved.append(renderSaved(url, name, logo, currentUrl === url));
			});
			$(".saved-lib").show();
		}
	});

	jQuery(document).on("click", ".edit", function (e) {
		e.stopPropagation();

		var card = $(this).parent();
		var url = card.data("url");
		var name = card.find("h3").text();
		var modal = $("#editLibraryModal");
		modal.find("#formGroupName").val(name);
		modal.find("#formGroupURL").val(url);
		modal.modal("show");
	});

	jQuery(document).on("click", ".delete", function (e) {
		e.stopPropagation();

		var card = $(this).parent();
		var url = card.data("url");
		var name = card.find("h3").text();
		var modal = $("#deleteModal");
		modal.find(".dl-name").html(name ? "<b>" + name + "</b>" : "this library");
		$("#deleteLibrary").data("url", url);
		modal.modal("show");
	});

	jQuery(document).on("click", "#deleteLibrary", function () {
		var url = $(this).data("url");
		if (!url) return;
		ipcRenderer.send("deleteWorkspace", url);
		window.location.reload();
	});

	function upsertLibrary() {
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
		if (!name) {
			alert("Please enter a name for the library");
			return;
		}
		var logo = [url, "theme/lighttheme/logo.png"].join("/");
		ipcRenderer.send("upsertWorkspace", { url, name, logo });
	}

	jQuery(document).on("submit", "#addLibraryForm", upsertLibrary);
	jQuery(document).on("submit", "#editLibraryForm", upsertLibrary);

	ipcRenderer.on("workspaces-updated", () => {
		window.location.reload();
	});

	jQuery(document).on("click", ".library-card", function (e) {
		e.stopPropagation();
		var url = $(this).data("url");
		if (!url) return;
		ipcRenderer.send("openWorkspace", url);
	});
});

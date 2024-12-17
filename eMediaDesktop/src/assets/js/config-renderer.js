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

function loadPrivateConfig() {
	fetch(`file://${__dirname}/private-config.html`)
		.then((response) => {
			if (response.ok) {
				return response.text();
			}
		})
		.then((response) => {
			$(".btn-wide").removeClass("active");
			$("#configcontent").html(response);
			$("#privateLibraries").addClass("active");
		})
		.then(() => {
			ipcRenderer.send("configInit");
		});
}

$("#privateLibraries").click(function () {
	loadPrivateConfig();
});

function loadCommunityLibraries() {
	$(".btn-wide").removeClass("active");
	$("#communityLibraries").addClass("active");
}
$("#communityLibraries").click(function () {
	loadCommunityLibraries();
});
function loadSandbox() {
	$(".btn-wide").removeClass("active");
	$("#sandbox").addClass("active");
}
$("#sandbox").click(function () {
	loadSandbox();
});

$(document).ready(function () {
	loadPrivateConfig();
	ipcRenderer.on(
		"config-init",
		(_, { workspaces, welcomeDone = false, currentUrl = null }) => {
			if (welcomeDone) {
				document.title = "Browse or Add eMedia Libraries";

				workspaces = workspaces.filter((workspace) => workspace.url);
				if (workspaces.length === 0) {
					// $("#addNewLibraryBtn").hide();
				} else {
					// $("#addNewLibraryBtn").show();
					var saved = $("#savedLibraries");
					saved.empty();
					workspaces.forEach(({ url, name, logo }) => {
						saved.append(renderSaved(url, name, logo, currentUrl === url));
					});
				}
			} else {
				// document.title = "Welcome to eMedia Desktop App";
				// $(".loader").remove();
				// $("#next").show();
			}
		}
	);
	jQuery(document).on("click", ".edit", function () {
		var card = $(this).parent();
		var url = card.data("url");
		var name = card.find("h3").text();
		var modal = $("#editLibraryModal");
		modal.find("#formGroupName").val(name);
		modal.find("#formGroupURL").val(url);
		modal.modal("show");
	});
	jQuery(document).on("click", ".delete", function () {
		var card = $(this).parent();
		var url = card.data("url");
		var name = card.find("h3").text();
		var modal = $("#deleteModal");
		modal.find(".dl-name").html(name ? "<b>" + name + "</b>" : "this library");
		$("#deleteLibrary").data("url", url);
		modal.modal("show");
	});

	jQuery(document).on("click", "#deleteLibrary", function (e) {
		e.stopPropagation();

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

	jQuery(document).on("click", ".library-card", function () {
		var url = $(this).data("url");
		ipcRenderer.send("openWorkspace", url);
	});
});

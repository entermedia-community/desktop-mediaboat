const { ipcRenderer } = require("electron");

// const extRoot = "http://web.localhost.com:8080/libraries";
const extRoot = "https://emedialibrary.com/libraries";

let hasPrivateLibraries = false;

function select(selector, root = document) {
	return root.querySelector(selector);
}

function selectAll(selector, root = document) {
	return Array.from(root.querySelectorAll(selector));
}

function setHtml(target, content) {
	const targetEl = typeof target === "string" ? select(target) : target;
	if (targetEl) {
		targetEl.innerHTML = content;
	}
}

function showModal(modalEl) {
	if (!modalEl) return;
	if (window.bootstrap && window.bootstrap.Modal) {
		window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
	}
}

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
			setHtml(target, response);
		})
		.then(() => {
			if (callback) callback();
			swapOrder(hasPrivateLibraries);
		})
		.catch((error) => {
			setHtml(
				target,
				`<div class="alert alert-error">Error: ${
					error.message || "Unknown error!"
				}</div>`,
			);
		});
}

function loadPrivateConfig() {
	selectAll(".btn-wide").forEach((el) => el.classList.remove("active"));
	const privateLibrariesBtn = select("#privateLibraries");
	if (privateLibrariesBtn) {
		privateLibrariesBtn.classList.add("active");
		privateLibrariesBtn.style.display = "";
	}
	const heading = select("#main h2");
	if (heading) heading.textContent = "Saved Libraries";
	const subheader = select(".subheader");
	if (subheader)
		subheader.textContent =
			"Add an existing eMedia library or use a free community library";
	fetchAndReplace(
		`file://${__dirname}/private-config.html`,
		() => {
			ipcRenderer.send("configInit");
		},
		"#configcontent",
	);
}

function loadCommunityLibraries() {
	selectAll(".btn-wide").forEach((el) => el.classList.remove("active"));
	const communityLibrariesBtn = select("#communityLibraries");
	if (communityLibrariesBtn) communityLibrariesBtn.classList.add("active");
	setHtml("#configcontent", '<span class="loader"></span>');
	const subheader = select(".subheader");
	if (subheader) subheader.textContent = "Select a community library to browse";
	fetchAndReplace(`${extRoot}?tab=communitylibrarylist`);
}

// function loadSandbox() {
// 	selectAll(".btn-wide").forEach((el) => el.classList.remove("active"));
// 	const sandboxButton = select("#sandbox");
// 	if (sandboxButton) sandboxButton.classList.add("active");
// 	setHtml("#configcontent", '<span class="loader"></span>');
// 	const subheader = select(".subheader");
// 	if (subheader) subheader.textContent =
// 		"Try out all the features as an admin in the sandbox library"
// 		;
//  fetchAndReplace(`${extRoot}?tab=sandboxlibrarylist`);
// }

function swapOrder(hasLib) {
	hasPrivateLibraries = hasLib;
	var privateLibraries = select("#privateLibraries");
	var communityLibraries = select("#communityLibraries");
	if (!privateLibraries || !communityLibraries) return;
	if (!hasLib) {
		communityLibraries.after(privateLibraries);
	} else {
		communityLibraries.before(privateLibraries);
	}
}
var initialLoad = true;
document.addEventListener("DOMContentLoaded", function () {
	fetchAndReplace(`${extRoot}?`, function () {
		loadPrivateConfig();
	});
	ipcRenderer.on("config-init", (_, { workspaces, currentUrl = null }) => {
		const backButton = select("#backButton");
		if (currentUrl !== null) {
			if (backButton) backButton.style.display = "";
		} else {
			if (backButton) backButton.style.display = "none";
		}
		document.title = "Browse or Add eMedia Libraries";
		workspaces = workspaces.filter((workspace) => workspace.url);
		swapOrder(workspaces.length > 0);
		if (workspaces.length > 0) {
			var saved = select("#savedLibraries");
			if (saved) {
				saved.innerHTML = "";
			}
			workspaces.forEach(({ url, name, logo }) => {
				if (saved) {
					saved.insertAdjacentHTML(
						"beforeend",
						renderSaved(url, name, logo, currentUrl === url),
					);
				}
			});
			const savedLib = select(".saved-lib");
			if (savedLib) savedLib.style.display = "";
		} else if (initialLoad) {
			initialLoad = false;
			loadCommunityLibraries();
		}
	});

	const backButton = select("#backButton");
	if (backButton) {
		backButton.addEventListener("click", function (e) {
			e.preventDefault();
			ipcRenderer.send("goBack");
		});
	}

	const main = select("#main");
	if (!main) return;

	main.addEventListener("click", function (e) {
		const privateLibraries = e.target.closest("#privateLibraries");
		if (privateLibraries) {
			e.preventDefault();
			loadPrivateConfig();
			return;
		}

		const communityLibraries = e.target.closest("#communityLibraries");
		if (communityLibraries) {
			e.preventDefault();
			loadCommunityLibraries();
			return;
		}

		const editButton = e.target.closest(".edit");
		if (editButton) {
			e.stopPropagation();
			var card = editButton.parentElement;
			if (!card) return;
			var url = card.dataset.url;
			var nameEl = card.querySelector("h3");
			var name = nameEl ? nameEl.textContent : "";
			var modal = select("#editLibraryModal");
			if (!modal) return;
			var nameInput = modal.querySelector("#formGroupName");
			var urlInput = modal.querySelector("#formGroupURL");
			if (nameInput) nameInput.value = name;
			if (urlInput) urlInput.value = url || "";
			showModal(modal);
			const editForm = select("#editLibraryForm");
			if (editForm) {
				editForm.dataset.url = url || "";
			}
			return;
		}

		const deleteButton = e.target.closest(".delete");
		if (deleteButton) {
			e.stopPropagation();
			var card = deleteButton.parentElement;
			if (!card) return;
			var url = card.dataset.url;
			var nameEl = card.querySelector("h3");
			var name = nameEl ? nameEl.textContent : "";
			var modal = select("#deleteModal");
			if (!modal) return;
			var nameSlot = modal.querySelector(".dl-name");
			if (nameSlot) {
				nameSlot.innerHTML = name ? "<b>" + name + "</b>" : "this library";
			}
			const dlBtn = select("#deleteLibrary");
			if (dlBtn) {
				dlBtn.dataset.url = url || "";
			}
			showModal(modal);
			return;
		}

		const deleteLibraryButton = e.target.closest("#deleteLibrary");
		if (deleteLibraryButton) {
			var url = deleteLibraryButton.dataset.url;
			if (!url) return;
			ipcRenderer.send("deleteWorkspace", url);
			window.location.reload();
			return;
		}

		const libraryCard = e.target.closest(".library-card");
		if (libraryCard) {
			e.stopPropagation();
			var url = libraryCard.dataset.url;
			if (!url) return;
			ipcRenderer.send("openWorkspace", url);
		}
	});

	function upsertLibrary(form, e) {
		e.preventDefault();
		var nameInput = form.querySelector("#formGroupName");
		var urlInput = form.querySelector("#formGroupURL");
		var name = nameInput ? nameInput.value : "";
		var url = urlInput ? urlInput.value : "";
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
		var privateLibrariesButton = select("#privateLibraries");
		var communityLibs = privateLibrariesButton
			? privateLibrariesButton.dataset.blockedLibs || ""
			: "";
		communityLibs = communityLibs.split("|");
		var urlHost = new URL(url).host;
		if (communityLibs.includes(urlHost)) {
			alert(
				"You cannot add a community library here\n\nUse the Community Libraries tab instead",
			);
			return;
		}
		if (!name) {
			alert("Please enter a name for the library");
			return;
		}
		var logo = [url, "theme/lighttheme/logo.png"].join("/");
		var prevUrl = form.dataset.url;
		ipcRenderer.send("upsertWorkspace", { url, name, logo, prevUrl });
	}

	main.addEventListener("submit", function (e) {
		const addForm = e.target.matches("#addLibraryForm") ? e.target : null;
		const editForm = e.target.matches("#editLibraryForm") ? e.target : null;
		const form = addForm || editForm;
		if (!form) return;
		upsertLibrary(form, e);
	});

	ipcRenderer.on("workspaces-updated", () => {
		window.location.reload();
	});
});

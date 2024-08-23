const { ipcRenderer } = require("electron");

function renderSaved(url, name, drive, logo) {
  var el = `<div class="df aic card saved" data-url="${url}" data-drive="${drive}" title="${url}">`;
  if (logo) {
    el += `<img src="${logo}" alt="${name}" onerror="this.onerror=null;this.src='assets/images/default-logo.png'"/>`;
  }
  if (name) {
    el += `<div><h3>${name}</h3></div>`;
  } else {
    el += `<div><small>${url}</small></div>`;
  }
  el +=
    '<button class="edit"><img src="assets/images/edit.svg" alt="Edit" style="width: 16px; height: 16px"/></button><button class="delete"><img src="assets/images/trash.svg" alt="Delete" style="width: 16px; height: 16px"/></button></div>';
  return el;
}

$(document).ready(function () {
  ipcRenderer.send("configInit");
  ipcRenderer.on(
    "config-init",
    (_, { workspaces, defaultLocalDrive, welcomeDone = false }) => {
      if (welcomeDone) {
        document.title = "Library Settings";
        $("#localDrive").val(defaultLocalDrive);
        $("#demos").addClass("show");
        setTimeout(() => {
          $("#welcome").remove();
        }, 300);
        workspaces = workspaces.filter((workspace) => workspace.url);
        if (workspaces.length === 0) {
          $("#savedLibraries").hide();
        } else {
          $("#savedLibraries").show();
          var saved = $("#savedLibraries").find("#saved");
          saved.empty();
          workspaces.forEach(({ url, name, drive, logo }) => {
            saved.append(renderSaved(url, name, drive, logo));
          });
        }
      } else {
        document.title = "Welcome to eMedia Desktop App";
        $(".loader").remove();
        $("#next").show();
      }
    }
  );
  jQuery("#next").click(function () {
    ipcRenderer.send("welcomeDone");
    $("#demos").addClass("show");
    $("#welcome").remove();
  });
  jQuery(document).on("click", ".delete", function (e) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this workspace?")) {
      return;
    }
    var url = $(this).parent().data("url");
    $(this).parent().remove();
    if ($("#saved").children().length === 0) {
      $("#savedLibraries").hide();
    }
    if (!url) return;
    ipcRenderer.send("deleteWorkspace", url);
  });
  jQuery(document).on("click", ".edit", function (e) {
    e.stopPropagation();
    var url = $(this).parent().data("url");
    var drive = $(this).parent().data("drive");
    var name = $(this).parent().find("h3").text();
    $("#url").val(url);
    $("#name").val(name);
    $("#localDrive").val(drive);
    $("#addBtns").hide();
    $("#add").text("Edit");
    $("#urlForm").addClass("show");
  });
  jQuery(document).on("click", "#addBtn", function () {
    $("#addBtns").hide();
    $("#add").text("+ Add");
    $("#urlForm").addClass("show");
  });
  jQuery(document).on("click", "#cancel", function () {
    $("#urlForm").removeClass("show");
    $("#url").val("");
    $("#name").val("");
    $("#addBtns").show();
  });
  jQuery(document).on("click", "#add", function () {
    var url = $("#url").val();
    var name = $("#name").val();
    var drive = $("#localDrive").val();
    if (!url) {
      alert("Please enter URL");
      return;
    }
    if (!drive) {
      alert("Please select a drive");
      return;
    }
    if (url.endsWith("/")) {
      url = url.substring(0, url.length - 1);
    }
    var logo = [url, "theme/images/logo.png"].join("/");
    ipcRenderer.send("addWorkspace", { url, name, drive, logo });
  });

  ipcRenderer.on("workspaces-updated", (_, workspaces) => {
    $("#savedLibraries").show();
    var saved = $("#savedLibraries").find("#saved");
    saved.empty();
    workspaces.forEach(({ url, name, drive, logo }) => {
      saved.append(renderSaved(url, name, drive, logo));
    });
    $("#addBtns").show();
    $("#urlForm").removeClass("show");
  });
  jQuery(document).on("click", "#localDrive", function (e) {
    e.preventDefault();
    window.postMessage({
      type: "configDir",
    });
  });
  ipcRenderer.on("config-dir", (_, path) => {
    if (!path) {
      return;
    }
    $("#localDrive").val(path);
  });
  jQuery(document).on("click", ".card", function () {
    var url = $(this).data("url");
    var drive = $(this).data("drive");
    ipcRenderer.send("openWorkspace", { url, drive });
  });
  jQuery(document).on("click", ".external-link", function (e) {
    e.preventDefault();
    var url = $(this).attr("href");
    ipcRenderer.send("openExternal", url);
  });
});

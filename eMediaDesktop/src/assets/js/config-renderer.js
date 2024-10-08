const { ipcRenderer } = require("electron");

function renderSaved(url, name, logo) {
  var el = `<div class="df aic saved" data-url="${url}" title="${url}">`;
  if (logo) {
    el += `<img src="${logo}" alt="${name}" onerror="this.onerror=null;this.src='assets/images/default-logo.png'"/>`;
  }
  el +=
    '<button class="edit"><img src="assets/images/edit.svg" alt="Edit" style="width: 16px; height: 16px"/></button><button class="delete"><img src="assets/images/trash.svg" alt="Delete" style="width: 16px; height: 16px"/></button>';
  if (name) {
    el += `<h3>${name}</h3>`;
  } else {
    el += `<h4>${url}</h4>`;
  }
  el += "</div>";
  return el;
}

$(document).ready(function () {
  ipcRenderer.send("configInit");
  ipcRenderer.on("config-init", (_, { workspaces, welcomeDone = false }) => {
    if (welcomeDone) {
      document.title = "Library Settings";
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
        workspaces.forEach(({ url, name, logo }) => {
          saved.append(renderSaved(url, name, logo));
        });
      }
    } else {
      document.title = "Welcome to eMedia Desktop App";
      $(".loader").remove();
      $("#next").show();
    }
  });
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
    var name = $(this).parent().find("h3").text();
    $("#url").val(url);
    $("#name").val(name);
    $("#addBtns").hide();
    $("#add").text("Edit");
    $("#urlForm").addClass("show");
  });
  jQuery(document).on("click", "#addBtn", function () {
    $("#addBtns").hide();
    $("#url").val("");
    $("#name").val("");
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
      if (!url.endsWith("find") || !url.startsWith("http")) {
        alert("Please enter a valid eMedia Library URL");
        return;
      }
    }
    if (!name) {
      alert("Please enter a name for the library");
      return;
    }
    var logo = [url, "theme/images/logo.png"].join("/");
    ipcRenderer.send("addWorkspace", { url, name, logo });
  });

  ipcRenderer.on("workspaces-updated", (_, workspaces) => {
    $("#savedLibraries").show();
    var saved = $("#savedLibraries").find("#saved");
    saved.empty();
    workspaces.forEach(({ url, name, logo }) => {
      saved.append(renderSaved(url, name, logo));
    });
    $("#addBtns").show();
    $("#urlForm").removeClass("show");
  });

  jQuery(document).on("click", ".card", function () {
    var url = $(this).data("url");
    ipcRenderer.send("openWorkspace", url);
  });
  jQuery(document).on("click", ".saved", function () {
    var url = $(this).data("url");
    console.log(url);
    ipcRenderer.send("openWorkspace", url);
  });
  jQuery(document).on("click", ".external-link", function (e) {
    e.preventDefault();
    var url = $(this).attr("href");
    ipcRenderer.send("openExternal", url);
  });
});

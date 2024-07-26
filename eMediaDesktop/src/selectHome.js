const { ipcRenderer } = require('electron');


var workspaces;

ipcRenderer.on("loadworkspaces", (_, workspaceslist) => {
    //TODO: update asset list
    if(workspaceslist !== undefined) {
        workspaces = workspaceslist;
        $.each(workspaces, function(key, item) {
            var newOption = new Option(item, item, false, false);
            $('.wspicker').append(newOption).trigger('change.select2');
        });
    }  
	
});

$(document).ready(function () {
    jQuery(".wspicker").select2({
        tags: true,
        placeholder: "Select or type your eMedia Library Workspace",
    });

    jQuery(".wspicker").on("select2:select", function(e) {
        var data = e.params.data;
        if(data) {
            ipcRenderer.send('setHomeUrl', data.text);
        }
        //$("#selectHomeUrlForm").trigger('submit');
    });

});
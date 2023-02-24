$(document).ready(function(){
    if(window && window.process && window.process.type) {
        console.log("Electron Detected on index.html");
        var electron = require('electron');
        const { ipcRenderer } = require('electron');
      
        $(".folderpicker").on("click", function(e) {
          e.stopPropagation();
          var options = $(this).data();
          console.log("Click event on index.html + "+options);
          ipcRenderer.send('uploadFolder', options);  
        });
    }
  });
const { ipcRenderer } = require('electron');

document.getElementById('selectHomeUrlForm').addEventListener('submit', (event) =>  {
    event.preventDefault();
    console.log(event);
    const input = event.target[0];

    ipcRenderer.send('setHomeUrl', input.value);

    input.value="";
});
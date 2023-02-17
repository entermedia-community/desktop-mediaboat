'use strict'

import { send } from "electron";


document.getElementById('selectHomeUrlForm').addEventListener('submit', (event) =>  {
    event.preventDefault();
    console.log(event);
    const input = event.target[0];

    send('setHomeUrl', input.value);

    input.value="";
});
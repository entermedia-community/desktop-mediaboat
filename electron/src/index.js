const electron = require("electron");

var http = require('http');
const https = require("https");
var url = require('url');
var querystring = require('querystring');
var fs = require('fs');
const mkdirp  = require('mkdirp')
var path = require('path');

const FormData = require('form-data');

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
const PROTOCOL_SCHEME = "entermedia";

const findProcess = require('find-process');
const protocol = electron.protocol;
const { app, BrowserWindow, Menu, getCurrentWindow, Tray, shell, dialog, ipcMain } = require("electron");
const fetch = require('electron-fetch').default;

//const ProgressBar = require('progress')

const os = require("os");
const computerName = os.hostname();
const userHomePath = app.getPath('home');

const Store = require('electron-store');
const store = new Store();


// env
const isDev = false;
const currentVersion = '0.5.9';
const selectWorkspaceForm = `file://${__dirname}/selectHome.html`;
// url
//const homeUrl = "https://emediafinder.com/app/workspaces/gotoapp.html";
//const homeUrl = "http://localhost:8080/finder/find/index.html?entermedia.key=cristobalmd542602d7e0ba09a4e08c0a6234578650c08d0ba08d&desktop=true;

// logos
const appLogo = "/assets/images/emrlogo.png";
const trayLogo = "/assets/images/em20.png";

// exports to renderer
//exports.startMediaBoat = startMediaBoat;
exports.loadNewUrl = openWorkspace;
exports.updateWorkSpaces = updateWorkSpaces;
exports.openLocalBrowser = openLocalBrowser;

//Upload Files
exports.uploadFolder = uploadFolder; 
exports.uploadFiles = uploadFiles; 

//Select Folder for Download
exports.selectFolder = selectFolder; 


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
//if (require("electron-squirrel-startup")) { app.quit(); }

// electron components
let mainWindow;
let mediaBoatClient;
let tray;
let session = require("electron");;
const entermediakey = '';

let trayMenu = [];
let workSpaces = [];
var mediaPID;
var mediaBoatLog = '';

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1024,
        icon: __dirname + appLogo,
        webPreferences: {
            nodeIntegration: true,
            nodeIntegrationInWorker: false,
            contextIsolation: false
        },
    });


    var homeUrl = store.get("homeUrl");
    //console.log("Searched " + homeUrl)
    if(!homeUrl) {
        openWorkspace(selectWorkspaceForm);
    }
    else {
        openWorkspace(homeUrl);
    }
    // Open the DevTools.
    if (isDev) { mainWindow.webContents.openDevTools(); }

    //const ses = session.fromPartition('persist:name')
    
    // Main Menu
    setMainMenu(mainWindow);

    // session (cookies and stuff)
    checkSession(mainWindow);

    // tray
    CreateTray([], mainWindow);

    //events
    mainWindow.on("minimize", (event) => {
        if (!isDev) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on("close", (event) => {
        if (!isDev) {
            if (!app.isQuiting) {
                event.preventDefault();
                mainWindow.hide();
            } else {
                //if (this.mediaBoatClient) KillAllMediaBoatProcesses();
            }
            return false;
        } else {
            //if (this.mediaBoatClient) KillAllMediaBoatProcesses();
        }
    });
};

function openWorkspace(homeUrl) {
    var parsedUrl = url.parse(homeUrl, true);
    var qs_ = querystring.stringify(parsedUrl.query)+"&desktop=true"
    var finalUrl = homeUrl.split("?").shift();
    finalUrl = finalUrl.trim()+'?'+qs_
    console.log('Loading... ', finalUrl);
    mainWindow.loadURL(finalUrl);

    checkSession(mainWindow);
}


ipcMain.on('setHomeUrl', (event, url) => {
    store.set("homeUrl", url);
    openWorkspace(url);
});  

function updateWorkSpaces(workspaces) {
    UpdateTray(mainWindow, workspaces);
}

function uploadFiles(inKey, inSourcepath, inMediadbUrl, inRedirectUrl) {
    entermediakey = inKey;
    let defaultpath = store.get("uploaddefaultpath");
    console.log(defaultpath);
    dialog.showOpenDialog(mainWindow, {
        defaultPath: defaultpath,
        properties: ['openFile', 'multiSelections']
    }, result => {
        if(result===undefined) return;
        const totalfiles = result.length;
        var directory = result[0];
        store.set("uploaddefaultpath", path.dirname(directory));

        let filecount = 0;
        let totalsize = 0;

        result.forEach(function (filename) {
            var stats = fs.statSync(filename);
            var fileSizeInBytes = stats.size;
            totalsize=+fileSizeInBytes;
            
        });

        
        result.forEach(function (filename) {
            const file = fs.createReadStream(filename);
            let filenamefinal = filename.replace(userHomePath, ''); //remove user home
            let sourcepath = inSourcepath+'/'+computerName+filenamefinal;

            if(filecount === 0) {
                let categorypath = path.dirname(sourcepath);
                let form = new FormData();
                form.append('sourcepath', categorypath);
                form.append('totalfilesize', totalsize);
                submitForm(form, inMediadbUrl+"/services/module/userupload/uploadstart", function() {});
            }

            let form = new FormData();
            form.append('sourcepath', sourcepath);
            form.append('file', file); 
            console.log("Uploading: " + sourcepath)
            submitForm(form, inMediadbUrl+"/services/module/asset/create", function() {})
            //Todo if false Exeption
            filecount++;
            if (filecount==totalfiles) {     
                mainWindow.loadURL(inRedirectUrl);
            }          
            //postRequest(inPostUrl, form)
        });

      });
}

function uploadFolder(entermediakey, inSourcepath, inMediadbUrl, inRedirectUrl, options) {
    let defaultpath = store.get("uploaddefaultpath");
    dialog.showOpenDialog(mainWindow, {
        defaultPath: defaultpath,
        properties: ['openDirectory']
    }, result => {
        if(result===undefined) return;

        var directory = result[0];
        store.set("uploaddefaultpath", directory);
        console.log("Directory selected:" + directory);
        startFolderUpload(directory, entermediakey, inSourcepath, inMediadbUrl, inRedirectUrl, options);

    });  

}

function startFolderUpload(directory, entermediakey, inSourcepath, inMediadbUrl, inRedirectUrl, options) {
    //console.log(`UserHomepath: ${userHomePath}`)   ;
    let directoryfinal = directory.replace(userHomePath, ''); //remove user home
    let categorypath = directoryfinal; //ToDo: get top level folder 
    let form1 = new FormData();
        /*
        options.map(obj => {

            for (const key in obj) {
                const value= obj[key];
                form.append(key, value);
            }
        });
        */
        if(options["moduleid"] != null && options["entityid"] != null) 
        {
            form1.append('moduleid', options["moduleid"]);
            form1.append('entityid', options["entityid"]);
        }
        //May need stronger path cleanup
        categorypath = categorypath.replace(":","");
        categorypath = categorypath.split(path.sep).join(path.posix.sep);
        //--

        form1.append('sourcepath', categorypath);
        //form.append('totalfilesize', totalsize); Todo: loop over files first
        //console.log(form);
        submitForm(form1, inMediadbUrl + "/services/module/userupload/uploadstart.json", function(){
            let savingPath = inSourcepath + "/" + computerName;
            loopDirectory(directory, savingPath, inMediadbUrl, inRedirectUrl);
            runJavaScript('$("#sidebarUserUploads").trigger("click");');
            runJavaScript('$(window).trigger("ajaxautoreload");');
        });

        //mainWindow.loadURL(inRedirectUrl); 
}

function runJavaScript(code) {
    mainWindow.webContents.executeJavaScript(code);
}

function loopDirectory(directory, savingPath, inMediadbUrl, inRedirectUrl) {
    let filecount = 0;
    let totalsize = 0;
    
    fs.readdir(directory, (err, files) => {
        
        files.forEach(file => {

            let filepath = path.join(directory,file);
            let stats = fs.statSync(filepath);
            if(stats.isDirectory()) {
                console.log('Subdirectory found: ' + filepath);
                let filenamefinal = filepath.replace(userHomePath, ''); //remove user home
                loopDirectory(filepath, savingPath, inMediadbUrl, inRedirectUrl);
            }
            else {
                let fileSizeInBytes = stats.size;
                totalsize=+fileSizeInBytes;
            }
            
        });    
    });

    //ToDO: Call JSON API to verify files are not already there.

    fs.readdir(directory, (err, files) => {
        files.forEach(file => {
            let filepath = path.join(directory,file);
            let stats = fs.statSync(filepath);
            if(stats.isDirectory()) {
                return;
            }
            let filestream = fs.createReadStream(filepath);
            //console.log(filestream);

            // filepath = filepath.replace("\\","/");
            filepath = filepath.replace(":","");

            let filenamefinal = filepath.replace(userHomePath, ''); //remove user home
            let sourcepath = path.join(savingPath,filenamefinal); 
            sourcepath = sourcepath.split(path.sep).join(path.posix.sep);

            let form = new FormData();
            form.append('sourcepath', sourcepath);
            form.append('file', filestream); 
            console.log('Uploading: '+ sourcepath);
            submitForm(form, inMediadbUrl+"/services/module/asset/create", function(){});
            form.on('progress', (bytesReceived, bytesExpected)  => {
                console.log('progress bytesReceived: ', bytesReceived);
                console.log('progress bytesExpected: ', bytesExpected);
            });
            filecount++;
            //postRequest(inPostUrl, form)
        });
    });

}


//Download
function selectFolder(inKey, downloadpaths) {
    entermediakey = inKey;
    //console.log("Download paths ", downloadpaths);
    let defaultpath = store.get("downloaddefaultpath");
    
    dialog.showOpenDialog(mainWindow, {
        defaultPath: defaultpath,
        properties: ['openDirectory']
    }, result => {
        if(result===undefined) return;
        let initialPath = result[0];
        
        store.set("downloaddefaultpath", initialPath);

        downloadpaths.forEach(function (downloadpath) {
            var selectedPath = initialPath;
            if(downloadpath.savetopath != '') {
                selectedPath = selectedPath + downloadpath.savetopath;
            }

            //download method
            downloadfile(downloadpath.url, selectedPath);
           
        });

        //openFile(initialPath);
        
    });
};


function downloadfile(fileurl, savepath) {
    /*
    //uses electron's session
    const options = {
        "headers": {"X-tokentype": "entermedia", "X-token": entermediakey}
    };
    */
   fetch(fileurl).then(response => {
        if (response.ok) {
            const reader = response.body;
            //console.log(reader);

            const contentLength = response.headers.get('content-length');
            // ensure contentLength is available
            if (!contentLength) {
            throw Error('Content-Length response header unavailable');
            }
            // parse the integer into a base-10 number
            const total = parseInt(contentLength, 10);
            let loaded = 0;
            console.log(contentLength);

            //console.log(response);
            //Create Path
            let dirpath = path.dirname(savepath);
            if (!fs.existsSync(dirpath)) {
                //console.log("Creating path: " + dirpath);
                mkdirp.sync(dirpath);
            }
            var out = fs.createWriteStream(savepath);
            response.body.pipe(out);

            out.on('finish', () => {
                out.close();
                console.log('File downloaded:' + savepath);
            });
        }
        
    })
    .catch(error => {
        console.error(error);
      })
 
}



function submitForm(form, inPostUrl, formCompleted){
    const q = url.parse(inPostUrl, true);
    //entermediakey = "cristobalmd542602d7e0ba09a4e08c0a6234578650c08d0ba08d";
    console.log("submitForm Sending Form: "+ inPostUrl);

    fetch(inPostUrl, { method: 'POST', body: form })
        .then(function(res) {
            //console.log("submitForm: complete ");
            if(typeof formCompleted === 'function') {
                formCompleted();
            }
            
        });

    /*
    form.on('progress', (bytesReceived, bytesExpected)  => {
        console.log('progress bytesReceived: ', bytesReceived);
        console.log('progress bytesExpected: ', bytesExpected);
    });
*/
}









function openFile(destPath) {
    console.log("Opening: " +destPath);
    shell.openItem(destPath);
}


//JSON Requests
function postRequest(inUrl, inBody) {
    console.log("Making request to " + inUrl)
    const request = http.request(inUrl, {
        method: 'POST',
        redirect: 'follow'
    });
    request.on('response', (response) => {
        console.log(`STATUS: ${response.statusCode}`);
        console.log(`HEADERS: ${JSON.stringify(response.headers)}`);
 
        response.on('data', (chunk) => {
            console.log(`BODY: ${chunk}`)
        });
    });
    request.on('finish', () => {
        console.log('Request is Finished')
    });
    request.on('abort', () => {
        console.log('Request is Aborted')
    });
    request.on('error', (error) => {
        console.log(`ERROR: ${JSON.stringify(error)}`);
        //callback(error);
    });
    request.on('close', (error) => {
        console.log('Last Transaction has occurred')
    });
    //request.setHeader('Content-Type', 'application/json');
    //request.setHeader('Content-Type', 'multipart/form-data');
    
    
    request.setHeader("X-tokentype", "entermedia");
    request.setHeader("X-token", entermediakey);

    //request.write("formData", inBody)
    //console.log(inBody);
    
    inBody.pipe(request);
    //inBody.submit(inUrl)

    //request.write(inBody, 'utf-8');
    request.end();
}

function setMainMenu(mainWindow) {
    const template = [{
        label: "eMedia Finder",
        submenu: [
            /*{ 
            label: "Logout",
            click() {
                this.session.clearStorageData([], function (data) { });
                mainWindow.loadURL(homeUrl);
                this.session.clearStorageData([], function (data) { });
                KillAllMediaBoatProcesses();
            }
        }, */{ 
            label: "Open Worspace",
            click() {
                //this.session.clearStorageData([], function (data) { });
                mainWindow.loadURL(selectWorkspaceForm);
                //this.session.clearStorageData([], function (data) { });
                //KillAllMediaBoatProcesses();
            }
        },
        {
            label: "Minimize To Tray", click() { mainWindow.hide(); },
        }, {
            label: "Exit", click() {
                app.isQuiting = true;
                app.quit();
            },
        }]
    }, {
        label: 'Browser', submenu: [
            { 
                label: "Back", click() { mainWindow.webContents.goBack(); }, 
            },
            {
                label: "Refresh", accelerator: "F5", click() { mainWindow.reload(); },
            },
            { 
                label: "Code Inspector", click() { mainWindow.webContents.openDevTools(); }, 
            }
        ]
    }, {
        label: "Edit",
        submenu: [
            { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
            { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
            { type: "separator" },
            { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
            { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
            { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
            { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
        ]
    }, {
        label: 'Help', submenu: [{
            label: "Log", click() {
                const options = {
                    buttons: ['Close'],
                    defaultId: 2,
                    title: 'eMediaBoatLog',
                    message: 'Logs',
                    detail: this.mediaBoatLog
                };
                dialog.showMessageBox(null, options);
            }
        }, {
            label: "version", click() {
                const options = {
                    buttons: ['Close'],
                    defaultId: 2,
                    title: 'Version',
                    message: 'Current version',
                    detail: 'eMediaFinder Desktop Version: ' + currentVersion
                };
                dialog.showMessageBox(null, options);
            },
        }]
    }];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    // Menu.setApplicationMenu(null);
}



// open Browser
function openLocalBrowser(url) {
    shell.openExternal(url);
}

function CreateTray(workSpaces, mainWin) {
    this.trayMenu = [];
    if (!this.tray) this.tray = new Tray(__dirname + trayLogo);

    workSpaces.forEach((ws) => {
        this.trayMenu.push({
            label: ws.label,
            click: () => {
                mainWin.show();
                mainWin.loadURL(ws.url);
            }
        });
    });
    DrawTray(mainWin);
    click = 0;
    this.tray.on("click", () => {
        click += 1;
        setTimeout(() => { click = 0; }, 1000);
        if (click >= 2) mainWin.show();
    });
}

function DrawTray(mainWin) {
    this.trayMenu.push({
        label: "Show App",
        click: () => { mainWin.show(); },
    });
    this.trayMenu.push({
        label: "Home",
        click: () => {
            KillAllMediaBoatProcesses();
            mainWin.show();
            mainWin.loadURL(homeUrl);
        },
    });
    this.trayMenu.push({
        label: "Quit",
        click: () => {
            app.isQuiting = true;
            app.quit();
        },
    });
    this.tray.setToolTip("eMedia Finder");
    var contextMenu = Menu.buildFromTemplate(this.trayMenu);
    this.tray.setContextMenu(contextMenu);
}

function UpdateTray(mainWin, workspaces) {
    newTrayMenu = [];
    newTrayMenu.push({
        label: "Show App",
        click: () => { mainWin.show(); },
    });
    workspaces.forEach((ws) => {
        newTrayMenu.push({
            label: ws.label,
            click: () => {
                mainWin.show();
                mainWin.loadURL(ws.url);
            },
        });
    });
    this.trayMenu = newTrayMenu;
    DrawTray();
}

function checkSession(win) {
   session = win.webContents.session;
   //console.log(session.defaultSession);
}

// temp
function showProgress(received, total, workspaceURL, username, key, mainWin) {
    var percentage = (received * 100) / total;
    console.log(percentage + "% | " + received + " bytes out of " + total + " bytes.");
    if (percentage === 100) {
        setTimeout(() => { // give some time for buffer to write disk
            if (this.mediaBoatClient && mediaPID) { KillAllMediaBoatProcesses(); }
            //spawnMediaBoat(workspaceURL, username, key, mainWin);
        }, 200);
    }
}

function FindProcess() {
    if (process.platform === "win32") {
        LogMediaBoat("Windows Detected");
        findProcess('name', "MediaBoatClient")
            .then(function (list) {
                for (var i = 0; i < list.length; i++) {
                    console.log('Assigning pid windows', list[i].pid);
                    pidToKill = list[i].pid;
                    mediaPID = pidToKill.toString();
                }
            });
        LogMediaBoat(`MediaBoatPID: ${mediaPID}`);
    }
}

if (!isDev) {
    const gotTheLock = app.getVersion()
    // .requestSingleInstanceLock();
    if (!gotTheLock) {
        app.quit();
    } else {
        app.on('second-instance', (event, commandLine, workingDirectory) => {
            if (mainWindow) {
                mainWindow.show()
            }
            console.log('length:', commandLine.length);
            if (commandLine.length >= 2) {
                commandLine.forEach(c => {
                    if (c.indexOf(PROTOCOL_SCHEME) !== -1) {
                        mainWindow.loadURL(c.replace(PROTOCOL_SCHEME, 'http'));
                    }
                });
            }
        });
        app.on("ready", createWindow);
        app.on("open-url", (event, url) => {
            if (mainWindow)
                mainWindow.loadURL(url.replace(PROTOCOL_SCHEME, 'http'));
            event.preventDefault();
        });
    }
} else {
    app.on("ready", createWindow);
}

function KillMediaBoatProcess(pid) {
    if (process.platform === 'win32') {
        process.kill(pid);
        const child_process = require("child_process");
        child_process.spawn("taskkill", ["/pid", pid, '/T', '/F'], { // Sometimes it needs a taskkill
            stdio: ['pipe', 'pipe', 'pipe'], shell: true,
        });
    } else
        if (process.platform === "darwin") {
            process.kill(pid);
        } else {
            process.kill(pid + 1);
        }
}

function KillAllMediaBoatProcesses() {
    findProcess('name', "MediaBoatClient").then(list => {
        console.log('processes to kill: ', list.length);
        for (var i = 0; i < list.length; i++) {
            console.log('Found MediaBoat: ', list[i].pid, list[i]);
            KillMediaBoatProcess(list[i].pid);
        }
    });
}
KillAllMediaBoatProcesses();

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        if (mediaPID) { KillMediaBoatProcess(mediaPID); }
        app.quit();
    }
});

app.on("will-quit", () => {
    if (mediaPID) { KillMediaBoatProcess(mediaPID); }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow(); }
});

// register protocol Scheme, only runs on install
app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);


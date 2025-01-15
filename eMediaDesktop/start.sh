export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
 1020  24/10/24 10:47:32 [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
 1021  24/10/24 10:48:44 nvm install 20
 1022  24/10/24 10:49:13 nvm use 20
 1023  24/10/24 10:49:39 nvm use --delete-prefix v20


install node js
npm install
npm run build
npm start

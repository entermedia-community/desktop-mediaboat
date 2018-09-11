#!/bin/bash -x

WORKSPACE_FOLDER="/var/jenkins_home/jobs/MediaBoat/workspace"
INSTALLER_FOLDER="$WORKSPACE_FOLDER/installer"
JDK_FOLDER="$INSTALLER_FOLDER/jdk"
BIN_FOLDER="$INSTALLER_FOLDER/bin"
DIST_FOLDER="$WORKSPACE_FOLDER/dist"
SCRIPTS_FOLDER="$INSTALLER_FOLDER/scripts"

# GET packr
if [[ ! -d $BIN_FOLDER ]]; then
	mkdir $BIN_FOLDER
	curl -X GET https://libgdx.badlogicgames.com/ci/packr/packr.jar > $BIN_FOLDER/packr.jar
fi

# GET JDKs
if [[ ! -d $JDK_FOLDER ]]; then
	mkdir -p $JDK_FOLDER
fi

if [[ ! -d $JDK_FOLDER/windows7 ]]; then
	mkdir -p $JDK_FOLDER/windows7/64 $JDK_FOLDER/windows7/32

	wget -c -O $JDK_FOLDER/windows7/32/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip?reload=true 
	wget -c -O $JDK_FOLDER/windows7/64/openjdk-1.7.0-u80-unofficial-windows-amd64-image.zip https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-windows-amd64-image.zip 
fi

if [[ ! -d $JDK_FOLDER/windows10 ]]; then
	mkdir -p $JDK_FOLDER/windows10/64
	
	wget -c -O $JDK_FOLDER/windows10/64/zulu8.31.0.1-jdk8.0.181-win_x64.zip https://cdn.azul.com/zulu/bin/zulu8.31.0.1-jdk8.0.181-win_x64.zip 
fi

if [[ ! -d $JDK_FOLDER/mac ]]; then
	mkdir -p $JDK_FOLDER/mac
	wget -c -O $JDK_FOLDER/mac/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip?reload=true 
fi

# Build Installers
java -jar $BIN_FOLDER/packr.jar $SCRIPTS_FOLDER/mediaboat-windows7-64.json
java -jar $BIN_FOLDER/packr.jar $SCRIPTS_FOLDER/mediaboat-windows10-64.json
java -jar $BIN_FOLDER/packr.jar $SCRIPTS_FOLDER/mediaboat-mac.json

rm -f $DIST_FOLDER/mediaboat-windows7.zip && cd $DIST_FOLDER/windows7-64/ && zip -r $DIST_FOLDER/mediaboat-windows7.zip .
rm -f $DIST_FOLDER/mediaboat-windows10.zip && cd $DIST_FOLDER/windows10-64/ && zip -r $DIST_FOLDER/mediaboat-windows10.zip .
rm -f $DIST_FOLDER/mediaboat-mac.zip && cd $DIST_FOLDER/ && zip -r $DIST_FOLDER/mediaboat-mac.zip mediaboat.app
rm -f $DIST_FOLDER/mediaboat-linux.zip && cd $DIST_FOLDER/ && cp $SCRIPTS_FOLDER/MediaBoat.sh . && zip -r $DIST_FOLDER/mediaboat-linux.zip MediaBoat.sh MediaBoatClient.jar
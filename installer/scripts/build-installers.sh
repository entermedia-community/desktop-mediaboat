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
if [[ ! -d $JDK_FOLDER/windows ]]; then
	mkdir -p $JDK_FOLDER/windows/64 $JDK_FOLDER/windows/32
	
	wget -c -O $JDK_FOLDER/windows/32/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip?reload=true 
	wget -c -O $JDK_FOLDER/windows/64/java-1.8.0-openjdk-1.8.0.181-1.b13.ojdkbuild.windows.x86_64.zip https://github.com/ojdkbuild/ojdkbuild/releases/download/1.8.0.181-1/java-1.8.0-openjdk-1.8.0.181-1.b13.ojdkbuild.windows.x86_64.zip 
fi
if [[ ! -d $JDK_FOLDER/mac ]]; then
	mkdir -p $JDK_FOLDER/mac
	wget -c -O $JDK_FOLDER/mac/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip?reload=true 
fi

# Build Installers
java -jar $BIN_FOLDER/packr.jar $SCRIPTS_FOLDER/mediaboat-windows64.json
java -jar $BIN_FOLDER/packr.jar $SCRIPTS_FOLDER/mediaboat-mac.json

rm -f $DIST_FOLDER/mediaboat-windows.zip && cd $DIST_FOLDER/windows64/ && zip -r $DIST_FOLDER/mediaboat-windows.zip .
rm -f $DIST_FOLDER/mediaboat-mac.zip && cd $DIST_FOLDER/ && zip -r $DIST_FOLDER/mediaboat-mac.zip mediaboat.app
rm -f $DIST_FOLDER/mediaboat-linux.zip && cd $DIST_FOLDER/ && cp $SCRIPTS_FOLDER/MediaBoat.sh . && zip -r $DIST_FOLDER/mediaboat-linux.zip MediaBoat.sh MediaBoatClient.jar
#!/bin/bash -x

INSTALLER_FOLDER="/var/jenkins_home/jobs/MediaBoat/workspace/installer"
JDK_FOLDER="$INSTALLER_FOLDER/jdk"
BIN_FOLDER="$INSTALLER_FOLDER/bin"
SCIPTS_FOLDER="$INSTALLER_FOLDER/scripts"

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
	
	curl -X GET https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip?reload=true > $JDK_FOLDER/windows/32/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip 
	curl -X GET https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-windows-amd64-image.zip?reload=true > $JDK_FOLDER/windows/64/openjdk-1.7.0-u80-unofficial-windows-amd64-image.zip 
fi
if [[ ! -d $JDK_FOLDER/mac ]]; then
	mkdir -p $JDK_FOLDER/mac
	curl -X GET https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip?reload=true > $JDK_FOLDER/mac/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip 
fi


java -jar $BIN_FOLDER/packr.jar $SCIPTS_FOLDER/mediaboat-mac.json
java -jar $BIN_FOLDER/packr.jar $SCIPTS_FOLDER/mediaboat-windows64.json

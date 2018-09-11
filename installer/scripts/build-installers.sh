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
	
	wget -c -O $JDK_FOLDER/windows/32/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip?reload=true 
	wget -c -O $JDK_FOLDER/windows/64/openjdk-1.7.0-u80-unofficial-windows-amd64-image.zip https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-windows-amd64-image.zip?reload=true 
fi
if [[ ! -d $JDK_FOLDER/mac ]]; then
	mkdir -p $JDK_FOLDER/mac
	wget -c -O $JDK_FOLDER/mac/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip?reload=true 
fi

# Build Installers
java -jar $BIN_FOLDER/packr.jar $SCIPTS_FOLDER/mediaboat-windows64.json
java -jar $BIN_FOLDER/packr.jar $SCIPTS_FOLDER/mediaboat-mac.json
java -jar $BIN_FOLDER/packr.jar $SCIPTS_FOLDER/mediaboat-linux64.json

rm -f /var/jenkins_home/jobs/MediaBoat/workspace/deploy/mediaboat-windows.zip && cd /var/jenkins_home/jobs/MediaBoat/workspace/dist/windows64/ && zip -r /var/jenkins_home/jobs/MediaBoat/workspace/deploy/mediaboat-windows.zip .
rm -f /var/jenkins_home/jobs/MediaBoat/workspace/deploy/mediaboat-mac.zip && cd /var/jenkins_home/jobs/MediaBoat/workspace/dist/ && zip -r /var/jenkins_home/jobs/MediaBoat/workspace/deploy/mediaboat-mac.zip mediaboat.app

rm -f /var/jenkins_home/jobs/MediaBoat/workspace/deploy/mediaboat-linux.zip
zip -r /var/jenkins_home/jobs/MediaBoat/workspace/deploy/mediaboat-linux.zip $SCRIPTS_FOLDER/MediaBoat.sh /var/jenkins_home/jobs/MediaBoat/workspace/dist/MediaBoatClient.jar 
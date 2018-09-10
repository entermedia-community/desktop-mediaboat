#!/bin/bash -x

<<<<<<< HEAD
if [[ ! -d ../jdk/windows ]]; then
	mkdir -p ../jdk/windows/64 ../jdk/windows/32
	
	curl -X GET https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip?reload=true > ../jdk/windows/32/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip 
	curl -X GET https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-windows-amd64-image.zip?reload=true > ../jdk/windows/64/openjdk-1.7.0-u80-unofficial-windows-amd64-image.zip 
fi
if [[ ! -d ../jdk/mac ]]; then
	mkdir -p ../jdk/mac
	curl -X GET https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip?reload=true > ../jdk/mac/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip 
fi


java -jar ../bin/packr.jar mediaboat-mac.json
java -jar ../bin/packr.jar mediaboat-windows64.json
=======
INSTALLER_FOLDER="/var/jenkins_home/jobs/MediaBoat/workspace/installer"
JDK_FOLDER="$INSTALLER_FOLDER/jdk"

# GET packr
if [[ ! -d $INSTALLER_FOLDER/bin ]]; then
	curl -X GET https://libgdx.badlogicgames.com/ci/packr/packr.jar > $INSTALLER_FOLDER/bin/packr.jar
fi

# GET JDKs
if [[ ! -d $JDK_FOLDER ]]; then
	mkdir -p $JDK_FOLDER
fi
if [[ ! -d "$JDK_FOLDER/windows" ]]; then
	mkdir -p "$JDK_FOLDER/windows/64" "$JDK_FOLDER/windows/32"
	
	curl -X GET https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip?reload=true > $JDK_FOLDER/windows/32/openjdk-1.7.0-u80-unofficial-windows-i586-image.zip 
	curl -X GET https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-windows-amd64-image.zip?reload=true > $JDK_FOLDER/windows/64/openjdk-1.7.0-u80-unofficial-windows-amd64-image.zip 
fi
if [[ ! -d "$JDK_FOLDER/mac" ]]; then
	mkdir -p "$JDK_FOLDER/mac"
	curl -X GET https://bitbucket.org/alexkasko/openjdk-unofficial-builds/downloads/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip?reload=true > $JDK_FOLDER/mac/openjdk-1.7.0-u80-unofficial-macosx-x86_64-image.zip 
fi


java -jar $INSTALLER_FOLDER/bin/packr.jar mediaboat-mac.json
java -jar $INSTALLER_FOLDER/bin/packr.jar mediaboat-windows64.json
>>>>>>> 602afd20923b642350aa34433ba3751ef5c27a52

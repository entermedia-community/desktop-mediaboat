#!/bin/bash -x

JDK_FOLDER="/var/jenkins_home/jobs/MediaBoat/workspace/jdk"

# GET packr
if [[ ! -d /var/jenkins_home/jobs/MediaBoat/workspace/bin ]]; then
	curl -X GET https://libgdx.badlogicgames.com/ci/packr/packr.jar > /var/jenkins_home/jobs/MediaBoat/workspace/bin/packr.jar
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


java -jar /var/jenkins_home/jobs/MediaBoat/workspace/bin/packr.jar mediaboat-mac.json
java -jar /var/jenkins_home/jobs/MediaBoat/workspace/bin/packr.jar mediaboat-windows64.json

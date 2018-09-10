#!/bin/bash -x

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

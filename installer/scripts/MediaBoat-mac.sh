#!/bin/bash
DIR=$( dirname "$0" )
cd "$DIR"
PWD="$(pwd)"
cd ../Resources && java -jar MediaBoatClient.jar

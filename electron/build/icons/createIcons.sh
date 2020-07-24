#!/bin/bash -x

function convertIMG(){
	convert $1 -resize ${2}! $2.png
}

convertIMG $1 16x16
convertIMG $1 32x32
convertIMG $1 48x48
convertIMG $1 64x64
convertIMG $1 128x128
convertIMG $1 256x256
convertIMG $1 512x512

cp 256x256.png icon.png
png2icns icon.icns 16x16.png 32x32.png 128x128.png 256x256.png 512x512.png

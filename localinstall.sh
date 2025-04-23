#!/bin/bash

echo Creating version of DVWebloader that uses only local libraries
echo Run this script in the directory with the dvwebloader.html file


dirLocal=$(pwd)

echo Downloading local copies of remote JavaScript libraries:
sed -n 's/.*src="\(http[^"]*\)".*/\1/p' *.html | sort -u | sed -n 's/^\(.*\/\)*\(.*\)/sed -i \x27s,\0\,lib\/\2,\x27 *.html/p' > replace_js.sh
sed -n 's/.*src="\(http[^"]*\)".*/\1/p' *.html | sort -u  > urls_js.txt
source replace_js.sh
cat urls_js.txt

echo Downloading local copies of remote JavaScript libraries referenced in js files:
cd ./js
sed -n 's/.*src[ ]*=[ ]*"\(http[^"]*\)".*/\1/p' *.js | sort -u | sed -n 's/^\(.*\/\)*\(.*\)/sed -i \x27s,\0\,lib\/\2,\x27 *.js/p' > replacejs_js.sh
sed -n 's/.*src[ ]*=[ ]*"\(http[^"]*\)".*/\1/p' *.js | sort -u  > urlsjs_js.txt
source replacejs_js.sh
cat urlsjs_js.txt
cd ..

echo Downloading local copies of remote CSS files:
sed -n 's/.*<link.*href="\(http[^"]*\)".*/\1/p' *.html | sort -u | sed -n 's/^\(.*\/\)*\(.*\)/sed -i \x27s,\0\,lib\/\2,\x27 *.html/p' > replace_css.sh
sed -n 's/.*<link.*href="\(http[^"]*\)".*/\1/p' *.html | sort -u > urls_css.txt
source replace_css.sh
cat urls_css.txt

if [ ! -d ./lib ]; then
  mkdir ./lib
fi
cd ./lib
while read url; do
    wget --quiet $url
done < "../urls_js.txt"
while read url; do
    wget --quiet $url
done < "../js/urlsjs_js.txt"


cd ".."
if [ ! -d ./css ]; then
  mkdir ./css
fi
cd ./css
while read url; do
    wget --quiet $url
done < "../urls_css.txt"

cd ..


echo Cleaning Up...
rm urls_js.txt
rm urls_css.txt
rm replace_js.sh
rm replace_css.sh
rm js/urlsjs_js.txt
rm js/replacejs_js.sh

echo Done
exit 0

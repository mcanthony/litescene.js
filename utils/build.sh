cd "$(dirname "$0")"
cp ../../collada/src/* ../external
cp ../../litegl/build/* ../external
python builder.py deploy_files.txt -o ../build/litescene.min.js -o2 ../build/litescene.js 
chmod a+rw ../build/* 

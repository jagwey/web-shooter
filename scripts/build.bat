@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
set CARGO_TARGET_DIR=C:\Users\Osman\.cargo-target\web-shooter
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
cd /d C:\Users\Osman\OneDrive\Desktop\projelerim\apps\web-shooter
npm run desktop:build

@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
set CARGO_TARGET_DIR=C:\Users\Osman\.cargo-target\web-shooter
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
rem Updater signing key lives outside the repo; never commit it.
set /p TAURI_SIGNING_PRIVATE_KEY=<"%USERPROFILE%\.tauri\web-shooter.key"
set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=
cd /d "%~dp0.."
call npm run desktop:build || exit /b 1
node scripts\make-latest-json.mjs

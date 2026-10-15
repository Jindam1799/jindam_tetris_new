@echo off
setlocal
rem ==== Jindam Chinese Tetris launcher (always opens in Google Chrome) ====
set "D=%~dp0"
set "U=%D:\=/%"
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined CHROME (
  for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul ^| find "REG_SZ"') do set "CHROME=%%B"
)
if not defined CHROME (
  echo Google Chrome was not found. Opening the Chrome download page...
  start "" "https://www.google.com/chrome/"
  pause
  exit /b
)
start "" "%CHROME%" --app="file:///%U%index.html" --window-size=1100,1000 --autoplay-policy=no-user-gesture-required

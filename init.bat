@echo off

REM Install chocolatey via official command from their website

REM powershell -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
powershell -Command "Invoke-WebRequest http://www.unifoundry.com/pub/unifont/unifont-15.0.01/font-builds/unifont-15.0.01.ttf -OutFile unifont-15.0.01.ttf"

REM choco install ffmpeg -y
REM choco install nodejs -y
Rem choco install imagemagick -y 
winget install ImageMagick.ImageMagick
winget install Gyan.FFmpeg
winget install OpenJS.NodeJS

REM npm install
REM on fresh nodejs install npm is not loaded
echo "If anything fails, a system restart is recommend"
PAUSE

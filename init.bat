@echo off

REM Install chocolatey via official command from their website
powershell -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
powershell -Command "Invoke-WebRequest http://www.unifoundry.com/pub/unifont/unifont-15.0.01/font-builds/unifont-15.0.01.ttf -OutFile unifont-15.0.01.ttf"

choco install ffmpeg -y
choco install nodejs -y
choco install imagemagick -y 


npm install
echo "If anything fails, a system restart is recommend"
PAUSE

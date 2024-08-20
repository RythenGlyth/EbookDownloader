# EbookDownloader
A tool to download purchased e-books from different publishers.

## Prerequisites
At first, clone or download the repository.

The tool uses image processing libraries and has to be executed with nodejs, therefore some dependencies are required.

You can eiher use the installation scripts (`init.bat` for Windows, `init.sh` for Debian based distros) or use manual installation. The Windows installation script will download all dependencies for you with chocolatey, a package manager for windows which will be installed by the script. It must be executed with admin priviledges.

Steps for manual installation:

### Windows
1. Download `unifont-15.0.01.ttf` from http://www.unifoundry.com/pub/unifont/unifont-15.0.01/font-builds/unifont-15.0.01.ttf and put it in the project root
1. Install `ffmpeg` and put the ffmpeg executable (named as `ffmpeg`) in the project root or add it to your path environment variable, if you need help you can follow [this](https://phoenixnap.com/kb/ffmpeg-windows) tutorial
1. Install `nodejs` and `npm` if you haven't already, you can find help [here](https://phoenixnap.com/kb/install-node-js-npm-on-windows)
1. Run `npm install`
1. Optionally install `image magick` and put the magick executable (named as `magick`) in the project root or add it to your path environment variable (required only for cornelsen "old method")

### Linux
1. Clone or download the repository
1. Run `wget "http://www.unifoundry.com/pub/unifont/unifont-15.0.01/font-builds/unifont-15.0.01.ttf"`
1. Install packages `ffmpeg`, `nodejs`, `npm` and optionally `imagemagick` (required only for cornelsen "old method") with your favorite package manager
1. Run `npm install`

## Running
Start the program by executing `npm start` from the project directory.

## Supported Publishers (websites)
| Publisher | Website | Best Quality | Selectable Text | Hyperrefs | Notes |
| --- | --- | --- | --- | --- | --- |
| Cornelsen ("New Method") | cornelsen.de | Lossless PDF | &check; | &check; |  |
| Cornelsen ("Old Method") | cornelsen.de | Image (8617px x 11792px) composition | &check; | &cross; |  |
| Cornelsen | scook.de | Image (?) composition | &cross; | &cross; | |
| Allango Klett | allango.net | Lossless PDF | &check; | ? | [1] |
| Klett | klett.de | Image (3072px x 4096px) composition | &check; | &check; | |
| Westermann | westermann.de | Image (2244px x 3071px) composition | &check; | &cross; | |
| C.C.BUCHNER | click-and-study.de | Image (1658px x 2211px) composition | &check; | &cross; | |
| Book2Look | book2look.com | Lossless PDF | &check; | ? | [2] |

[1]: Website allows to download files that are not owned

[2]: No Account needed, only the book id

## Contributing

Feel free to create issues and pull requests to contribute to the project.

## Disclaimer
This project is for educational purposes only. The project is not responsible for any misuse of the software. Depending on your jurisdiction, it may be illegal to use this software to download e-books without the consent of the publisher. In other jurisdictions, it may be legal to download e-books for personal use only. Please check your local laws before using this software.

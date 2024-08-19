# EbookDownloader

A tool to download purchased e-books from different publishers.

## Running

1. Clone or download the zip
1. Download `unifont-15.0.01.ttf` from http://www.unifoundry.com/pub/unifont/unifont-15.0.01/font-builds/unifont-15.0.01.ttf and put it in the project root
1. install `image magick` and put the magick executable in the project root or add it to your path environment variable (required only for cornelsen "old method")
1. install `ffmpeg` and put the ffmpeg executable in the project root or add it to your path environment variable
1. run `npm install`
1. run `npm start`

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

## Disclaimer
This project is for educational purposes only. The project is not responsible for any misuse of the software. Depending on your jurisdiction, it may be illegal to use this software to download e-books without the consent of the publisher. In other jurisdictions, it may be legal to download e-books for personal use only. Please check your local laws before using this software.
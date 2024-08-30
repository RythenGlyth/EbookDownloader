const readline = require('readline');
const axios = require('axios');
const qs = require('querystring');
const axiosCookieJarSupport = require('axios-cookiejar-support').wrapper;
const tough = require('tough-cookie');
const fs = require('fs');
const PDFDoc = require('pdfkit');
const util = require('util')
const prompts = require('prompts');
const https = require('https')
const crypto = require('crypto')
var spawn = require('child_process').spawn
var Iconv = require('iconv').Iconv;
const sizeOf = require('image-size')
const pdflib = require("pdf-lib")

var HTMLParser = require('node-html-parser');
var parseString = require('xml2js').parseString;
const { stdin, stdout } = require('process');
const { resolve } = require('path');
const path = require('path');
const { url } = require('inspector');
const transformationMatrix = require('transformation-matrix')

const AdmZip  = require('adm-zip')
const consumers = require('node:stream/consumers')
const { PassThrough } = require('stream')
const { expandToNearestJSONObject, zeroPad } = require('../utils')

axiosCookieJarSupport(axios);

function decomposeTSR(tsr) {
    return transformationMatrix.decomposeTSR(toAffineMatrix(tsr))
}

function toAffineMatrix(tsr) {
    return tsr.reduce((a, c, i) => (a[String.fromCharCode(97 + i)] = c, a), {})
}

function clicknstudy(email, passwd, deleteAllOldTempImages) {
    const cookieJar = new tough.CookieJar();
    const axiosInstance = axios.create({
        jar: cookieJar,
        withCredentials: true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.4103.116 Safari/537.36',
        }
    });
    axiosInstance({
        method: 'get',
        url: "https://www.click-and-study.de/"
    }).then(async (res) => {
        axiosInstance({
            method: "get",
            url: "https://login.ccbuchner.de/realms/ccbuchner/protocol/openid-connect/auth",
            params: {
                client_id: "helliwood",
                scope: "openid profile email wh",
                response_type: "code",
                redirect_uri: "https://www.click-and-study.de/Buecher",
            }
        }).then(async (res) => {
            const root = HTMLParser.parse(res.data);
            axiosInstance({
                method: "post",
                url: root.querySelector("form").getAttribute("action"),
                data: qs.stringify({
                    username: email,
                    password: passwd,
                }),
            }).then(async (res) => {
        // axiosInstance({
        //     method: 'post',
        //     url: "https://www.ccbuchner.de/clickandstudy/login.html?redirect=https://www.click-and-study.de/Buecher",
        //     data: qs.stringify({
        //         wako_email: email,
        //         wako_passwort: passwd,
        //         ct_redirect: "https://www.click-and-study.de/Buecher",
        //         ct_btn_anmelden: ""
        //     })
        // }).then((res) => {
        //     const root = HTMLParser.parse(res.data);
        //     axiosInstance({
        //         method: 'get',
        //         url: root.querySelector("meta[http-equiv='refresh']").getAttribute("content").split(";")[1]
        //     }).then(async (res) => {

                const getUrl = (path) => new URL(path, "https://www.click-and-study.de/").href
                const root = HTMLParser.parse(res.data);
                //console.log(res.data)
                if (root.innerHTML.includes("Ungültige E-Mail oder Passwort.")) {
                    throw new Error("Incorrect mail address or password!");
                }
                const books = root.querySelectorAll(".bookItem").map(book => {
                    return {
                        title: book.querySelector(".title").text,
                        link: getUrl(book.querySelector("a").getAttribute("href")),
                    }
                });
                if (books.length == 0) {
                    throw new Error("No books found!");
                }
                var book = (await prompts([{
                    type: "select",
                    name: "book",
                    message: "Select a book",
                    choices: books.map(book => {
                        return {
                            title: book.title,
                            value: book
                        }
                    })
                }])).book
                var selectableText = (await prompts([{
                    type: "toggle",
                    name: "selectableText",
                    message: "Selectable text",
                    initial: true,
                }])).selectableText
                axiosInstance({
                    method: 'get',
                    url: book.link
                }).then(async (res) => {
                    /**
                     * @type {{
                     * ajaxUrl: string,
                     * ajaxBookmarkUrl: string,
                     * ajaxSaveSpot: string, 
                     * apiToken: string, 
                     * apiMediaUrl: string, 
                     * buyUrl: string, 
                     * bookId: string, 
                     * bookName: string, 
                     * pageOffset: number, 
                     * pageOffsetLabels: object<string, number>, 
                     * startPage: number, 
                     * endPage: number, 
                     * onePageOnly: boolean, 
                     * imgDir: string, 
                     * tier: string, 
                     * containerAId: string, 
                     * containerBId: string
                     * }}
                     */
                    var bookData = expandToNearestJSONObject(res.data, res.data.indexOf("new PDFBookPublic({") + 19)

                    var pageOffsetLabelsRev = Object.entries(bookData.pageOffsetLabels).reduce((result, value) => ({ ...result, [value[1]]: value[0] }), {});

                    var name = bookData.bookName.replace(/[^a-za-z0-9 \(\)_\-,\.]/gi, '');
                    var folder = ("./out/DownloadTemp/" + name + "/");
                    if (deleteAllOldTempImages && fs.existsSync(folder)) fs.rmSync(folder, {
                        recursive: true,
                    });
                    console.log("deleted temp files");
                    fs.mkdirSync(folder, {
                        recursive: true
                    });
                    console.log("created folder: " + folder)

                    var pagesData = []

                    console.log(`downloaded 0/${bookData.endPage} pages`)
                    for (var i = 0; i <= bookData.endPage - bookData.startPage; i++) {

                        var pageLabel = i + bookData.startPage - bookData.pageOffset;

                        if (pageLabel <= 0) {
                            pageLabel = pageOffsetLabelsRev[i + bookData.startPage];
                        }

                        var url = getUrl(bookData.imgDir + bookData.bookId + "/" + (i + bookData.startPage));
                        await new Promise((resolve, reject) => {
                            axiosInstance({
                                method: 'get',
                                url: url,
                                responseType: 'stream'
                            }).then(res => {
                                ffmpegProcess = spawn("ffmpeg", ["-f", "jpeg_pipe", "-i", "-", "-f", "image2", "-"]);
                                ffmpegProcess.stdout.pipe(fs.createWriteStream(`${folder}${zeroPad(i, 4)}-${pageLabel}.jpg`));
                                res.data.pipe(ffmpegProcess.stdin).on('finish', () => {
                                    axiosInstance({
                                        method: 'post',
                                        url: getUrl(bookData.ajaxUrl),
                                        data: qs.stringify({
                                            op: "loadPage",
                                            page: i + bookData.startPage,
                                            id: bookData.bookId,
                                        })
                                    }).then((res) => {
                                        pagesData[i] = res.data;
                                        resolve()
                                    }).catch(err => {
                                        console.error(err)
                                        console.log("error while loading page " + i + " -e505")
                                        reject()
                                    })
                                })
                            }).catch(err => {
                                console.log(err)
                                console.log("error while downloading pages - e504")
                                reject()
                            })
                        });


                        console.log(`\x1b[1A\x1b[2K\x1b[1GDownloaded ${i}/${bookData.endPage} pages`)

                    }

                    console.log("downloaded all pages")

                    var size = [pagesData[0].width, pagesData[0].height]

                    var doc = new PDFDoc({
                        size,
                        margins: {
                            top: 0,
                            bottom: 0,
                            left: 0,
                            right: 0
                        },
                        autoFirstPage: false,
                        bufferPages: true
                    });
                    doc.pipe(fs.createWriteStream("./out/" + name + ".pdf"));
                    doc.font('./unifont-15.0.01.ttf')
                    var dir = fs.readdirSync(folder);
                    dir.sort().forEach((file, idx) => {
                        doc.addPage();
                        doc.rect(0, 0, size[0], size[1]).fill("#000000");
                        var thissize = sizeOf(folder + file);
                        var thissizefitted = {
                            width: Math.min(size[0] / thissize.width, size[1] / thissize.height) * thissize.width,
                            height: Math.min(size[0] / thissize.width, size[1] / thissize.height) * thissize.height
                        }
                        doc.image(folder + file, {
                            fit: size,
                            align: 'center',
                            valign: 'center'
                        })
                        if (selectableText) {
                            var pd = JSON.parse(pagesData[idx].data)
                            var outerTransform = toAffineMatrix(pd.viewport.transform)
                            var outerTransformTr = transformationMatrix.decomposeTSR(outerTransform)
                            doc.save()
                            doc.translate((size[0] - thissizefitted.width) / 2, (size[1] - thissizefitted.height) / 2)
                            doc.translate(pd.viewport.viewBox[0], pd.viewport.viewBox[1])

                            doc.scale((thissizefitted.width - pd.viewport.viewBox[0]) / pd.viewport.viewBox[2], (thissizefitted.height - pd.viewport.viewBox[1]) / pd.viewport.viewBox[3])
                            doc.transform(...pd.viewport.transform)
                            pd.textObjects.forEach(text => {
                                var transform = toAffineMatrix(text.transform)
                                var transformTr = transformationMatrix.decomposeTSR(transform)
                                transform.a /= transformTr.scale.sx
                                transform.b /= transformTr.scale.sx
                                transform.c /= transformTr.scale.sy
                                transform.d /= transformTr.scale.sy
                                doc.save()
                                doc.transform(...Object.values(transform))
                                doc.scale(1, -1)
                                
                                if (text.str
                                    && doc.widthOfString(text.str, { lineBreak: false }) > 0
                                    && doc.heightOfString(text.str, { lineBreak: false }) > 0) {
                                    doc.scale(text.width / doc.widthOfString(text.str, {
                                        lineBreak: false
                                    }), text.height / doc.heightOfString(text.str, {
                                        lineBreak: false
                                    }))

                                    doc.opacity(0)
                                    doc.text(text.str, 0, 0, {
                                        lineGap: 0,
                                        paragraphGap: 0,
                                        lineBreak: false,
                                        baseline: 'bottom',
                                        align: 'left',
                                    })
                                }
                                doc.restore()
                            })
                            doc.restore()
                        }
                    })

                    doc.end()
                    console.log("Wrote ./out/" + name + ".pdf")
                }).catch(err => {
                    console.log(err)
                    console.log("Error while getting book - e503")
                })
            }).catch((err) => {
                console.log(err)
                console.log("ccbuchner booklist loading failed - e502");
            })
        }).catch((err) => {
            console.log(err);
            console.log("ccbuchner Login failed - e501");
        })
    }).catch((err) => {
        console.log(err);
        console.log("ccbuchner Login failed - e500");
    })

}

module.exports = clicknstudy;
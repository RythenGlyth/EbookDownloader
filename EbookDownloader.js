const readline = require('readline');
const axios = require('axios');
const qs = require('querystring');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
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

var HTMLParser = require('node-html-parser');
var parseString = require('xml2js').parseString;
const { stdin, stdout } = require('process');
const { resolve } = require('path');
const path = require('path');
const { url } = require('inspector');
const transformationMatrix = require('transformation-matrix')

function decomposeTSR(tsr) {
    return transformationMatrix.decomposeTSR(toAffineMatrix(tsr))
}

function toAffineMatrix(tsr) {
    return tsr.reduce((a, c, i) => (a[String.fromCharCode(97 + i)] = c, a), {})
}

axiosCookieJarSupport(axios);

prompts([
    {
        type: 'select',
        name: 'publisher',
        message: "Publisher",
        choices: [
            {
                title: 'Cornelsen',
                value: "cornelsen"
            },
            {
                title: 'Klett',
                value: "klett"
            },
            {
                title: 'scook (Cornelsen) - old',
                value: "scook"
            },
            {
                title: 'Westermann',
                value: "westermann"
            },
            {
                title: 'C.C.BUCHNER - click & study',
                value: "clicknstudy"
            }
        ]
    },
    {
        type: 'text',
        name: 'email',
        message: (prev, values) => values.publisher == "cornelsen" ? "Name (Empty to read from config)" : 'Email (Empty to read from config)'
    },
    {
        type: 'password',
        name: 'passwd',
        message: "Pasword (Empty to read from config)",
    },
    {
        type: 'confirm',
        name: 'deleteAllOldTempImages',
        message: "Delet old temp images",
        initial: true
    }
]).then(inputs => {
    inputs.email = inputs.email || require("./config.json")?.[inputs.publisher]?.email;
    inputs.passwd = inputs.passwd || require("./config.json")?.[inputs.publisher]?.passwd;

    switch (inputs.publisher) {
        case "cornelsen":
            cornelsen(inputs.email, inputs.passwd, inputs.deleteAllOldTempImages)
            break;
        case "klett":
            klett(inputs.email, inputs.passwd, inputs.deleteAllOldTempImages)
            break;
        case "scook":
            scook(inputs.email, inputs.passwd, inputs.deleteAllOldTempImages)
            break;
        case "westermann":
            westermann(inputs.email, inputs.passwd, inputs.deleteAllOldTempImages)
            break;
        case "clicknstudy":
            clicknstudy(inputs.email, inputs.passwd, inputs.deleteAllOldTempImages)
            break;
    }
})
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
            method: 'post',
            url: "https://www.ccbuchner.de/clickandstudy/login.html?redirect=https://www.click-and-study.de/Buecher",
            data: qs.stringify({
                wako_email: email,
                wako_passwort: passwd,
                ct_redirect: "https://www.click-and-study.de/Buecher",
                ct_btn_anmelden: ""
            })
        }).then((res) => {
            const getUrl = (path) => new URL(path, "https://www.click-and-study.de/").href
            const root = HTMLParser.parse(res.data);
            axiosInstance({
                method: 'get',
                url: root.querySelector("meta[http-equiv='refresh']").getAttribute("content").split(";")[1]
            }).then(async (res) => {
                const root = HTMLParser.parse(res.data);
                //console.log(res.data)
                const books = root.querySelectorAll(".bookItem").map(book => {
                    return {
                        title: book.querySelector(".title").text,
                        link: getUrl(book.querySelector("a").getAttribute("href")),
                    }
                });
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
                    var folder = ("./DownloadTemp/" + name + "/");
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
                    doc.pipe(fs.createWriteStream(name + ".pdf"));
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
                    console.log("Wrote " + name + ".pdf")


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

function westermann(email, passwd, deleteAllOldTempImages) {
    const cookieJar = new tough.CookieJar();
    const axiosInstance = axios.create({
        jar: cookieJar,
        withCredentials: true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36',
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
        }
    });
    axiosInstance({
        url: "https://bibox2.westermann.de/",
        method: "get"
    }).then(async (res) => {
        const root = HTMLParser.parse(res.data);

        axiosInstance({
            url: new URL(root.querySelectorAll("script").filter(l => l.getAttribute("src")?.startsWith("main"))[0].getAttribute("src"), "https://bibox2.westermann.de/").href,
            method: "GET"
        }).then(res => {
            /**
             * @type {{production: boolean, dataPrivacyUrl: string, backendUrl: string, backendLogin: boolean, frontendUrl: string, frontendUrlIOS: string, accountAdminUrl: string, changePasswordUrl: string, zsv: { live: boolean, url: string, }, sentry: { enabled: boolean, dsn: string, }, matomoUrl: string, matomoSiteId: number, maxUploadFileSize: {        forTeacher: number, forUser: number, }, pingTimer: number, oauth: { loginURL: string, logoutURL: string, postLogoutRedirect: string, redirectURL: string, clientID: string, protocol: string, }}}
            }}
            */
            var mainjs = res.data;
            var p = mainjs.match(/environmentName\w*:\w*/).index;
            var environment = expandToNearestJSONObject(mainjs, p)
            /*var p0 = p;
            for(var braces = 0; braces != -1; p0--) {
                if(mainjs[p0] == "}") braces++;
                if(mainjs[p0] == "{") braces--;
            }
            var p1 = p;
            for(var braces = 0; braces != -1; p1++) {
                if(mainjs[p1] == "{") braces++;
                if(mainjs[p1] == "}") braces--;
            }

            eval("var environment =" + mainjs.slice(p0+1,p1))*/

            var codeVerifier = randomString(50)
            var codeChallenge = sha256hash.update(codeVerifier).digest('base64').replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
            var state = randomString(20);

            axiosInstance({
                url: environment.oauth.loginURL + "?client_id=" + environment.oauth.clientID + "&response_type=code&scope=openid&redirect_uri=" + environment.oauth.redirectURL + "&state=" + state + "&code_challenge_method=S256&code_challenge=" + codeChallenge,
                method: "GET",
            }).then(res => {
                var parsedHTML = HTMLParser.parse(res.data);
                var form = parsedHTML.querySelector("form");
                axiosInstance({
                    url: "https://mein.westermann.de" + form.getAttribute("action"),
                    method: "post",
                    data: qs.stringify({
                        "account": email,
                        "password": passwd,
                        "remember": 0,
                        "action": "login",
                    }),
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                }).then(res => {
                    var fwLoginUrl = new URL(res.data.match(/window.location = "(.*)";/)[1].replaceAll(/\\\//g, "\/"));
                    var code = fwLoginUrl.searchParams.get("code");
                    if (state == fwLoginUrl.searchParams.get("state")) {
                        axiosInstance({
                            url: fwLoginUrl.href,
                            method: "GET",
                        }).then(res => {
                            axiosInstance({
                                url: `${environment.backendUrl}/token`,
                                method: "post",
                                data: qs.stringify({
                                    code_verifier: codeVerifier,
                                    redirect_uri: environment.oauth.redirectURL,
                                    code
                                }),
                            }).then(res => {
                                /** @type {{id_token: string, token_type: string, expires_in: number, access_token: string, refresh_token: string}} */
                                var tokens = res.data;

                                axiosInstance.defaults.headers.authorization = `${tokens.token_type} ${tokens.access_token}`

                                axiosInstance({
                                    url: `${environment.backendUrl}/api/user`,
                                    method: "get",
                                }).then(async res => {
                                    /** @type {{abos: Object[], addonModuleLicenses: Object[], bookLicenses: {bookId: number, id: string, isbn: string, title: string, type: string}[], canChangeZSVPassword: boolean, groupId: number, id: number, params: Object, schools: Object[], type: string, username: string}} */
                                    var userData = res.data

                                    var book = (await prompts([{
                                        type: "select",
                                        name: "book",
                                        message: "Select a book",
                                        choices: userData.bookLicenses.map(book => {
                                            return {
                                                title: book.title,
                                                value: book
                                            }
                                        })
                                    }])).book

                                    var bookID = book.bookId;


                                    axiosInstance({
                                        url: `${environment.backendUrl}/api/sync/${bookID}?materialtypes[]=default&materialtypes[]=addon`,
                                        method: "get",
                                    }).then(async res => {

                                        /** @typedef {{bookId: number, children: Chapter[], demo: boolean, filesize: Object, hasDemoMaterials: boolean, id: number, md5sum: Object, pagenumEnd: string, pagenumStart: string, removed: boolean, sortCode: number, title: string, type: string, version: number}} Chapter  */

                                        /** @typedef {{bookId: number, categoryId: number, chapterIds: number[], demo: number, description: Object, file: string, filesize: number, filetype: string, grades: Object, id: number, keywords: string, md5sum: string, mimetype: string, pageIds: number[], pagesCount: Object, preview_filename: string, preview_filesize: number, preview_height: Object, preview_md5sum: string, preview_url: string, preview_width: Object, price: Object, publish_date: Object, removed: number, shop_url: Object, sortCode: number, subjects: Object, title: string, type: string, version: number, zipUrl: Object}} Material */

                                        /** @typedef {{aemDorisID: Object, bookId: number, demo: boolean, id: number, images: {filesize: number, height: number, id: number, md5sum: string, pageId: number, removed: boolean, url: string, version: number, width: number}[], internalPagenum: number, name: string, removed: boolean, type: string, version: number}} Page */

                                        /** @type {{book: {addonmodules: Object[], chapterVersion: number, coverHash: string, coverUrl: string, demo: boolean, demoMaterials: boolean, description: string, hasZav: boolean, hidePageInput: boolean, id: number, isbn: string, lastModified: number, pageDataHash: string, pageDataSize: number, pagenum: number, publisher: string, region: string, removed: boolean, searchIndexHash: string, searchIndexSize: number, subtitle: string, title: string, version: number}[], categories: {addonModuleRelated: boolean, bookId: number, count: number, demo: number, downloadSize: number, guid: Object, id: number, removed: boolean, sortCode: number, title: string, version: number}[], chapters: Chapter[], materials: Material[], pages: Page[]}} */
                                        var bookData = res.data;

                                        var quality = (await prompts([{
                                            type: "select",
                                            name: "quality",
                                            message: "Select the Quality",
                                            choices: bookData.pages[0].images.map((img, idx) => {
                                                return {
                                                    title: img.width + "x" + img.height,
                                                    value: idx
                                                }
                                            })
                                        }])).quality

                                        var selectableText = (await prompts([{
                                            type: "toggle",
                                            name: "selectableText",
                                            message: "Selectable text",
                                            initial: true,
                                        }])).selectableText


                                        var name = book.title.replace(/[^a-zA-Z0-9 \(\)_\-,\.]/gi, '') + "_" + `${bookData.pages[0].images[quality].width}x${bookData.pages[0].images[quality].height}`;
                                        var folder = ("./DownloadTemp/" + name + "/");
                                        if (deleteAllOldTempImages && fs.existsSync(folder)) fs.rmSync(folder, {
                                            recursive: true,
                                        });
                                        console.log("Deleted Temp files");
                                        fs.mkdirSync(folder, {
                                            recursive: true
                                        });
                                        console.log("created Folder: " + folder)


                                        var pageData = selectableText && await new Promise((resolve, reject) => {
                                            console.log(`Downloading selectable Text`)
                                            axiosInstance({
                                                url: `${environment.backendUrl}/api/books/${bookID}/pageData`,
                                                method: "get",
                                            }).then(res => {
                                                axiosInstance({
                                                    url: res.data.tempUrl,
                                                    method: "get",
                                                }).then(async res => {
                                                    resolve(res.data);
                                                }).catch(err => {
                                                    console.log(err)
                                                    console.log(`Could not load book text - 409`)
                                                    reject()
                                                })
                                            }).catch(err => {
                                                console.log(err)
                                                console.log(`Could not load book text - 408`)
                                                reject()
                                            })
                                        })

                                        console.log(`Downloaded 0/${bookData.pages.length} pages`)

                                        for (var pi = 0; pi < bookData.pages.length; pi++) {
                                            var page = bookData.pages[pi];
                                            var url = page.images[quality].url;
                                            await new Promise((resolve, reject) => {
                                                axios({
                                                    url: url,
                                                    method: "get",
                                                    responseType: 'stream',
                                                }).then((res) => {
                                                    res.data.pipe(fs.createWriteStream(`${folder}${zeroPad(pi, 4)}-${page.id}-${page.name}.${url.split(".").slice(-1)[0]}`)).on('finish', () => {
                                                        resolve();
                                                    })
                                                }).catch(err => {
                                                    console.log(err);
                                                    console.log("Error downloading page " + pi)
                                                    resolve();
                                                })
                                            });

                                            console.log(`\x1b[1A\x1b[2K\x1b[1GDownloaded ${pi + 1}/${bookData.pages.length} pages`)
                                        }

                                        var size = [bookData.pages[0].images[0].width, bookData.pages[0].images[0].height];

                                        console.log("Merging into PDF");

                                        var doc = new PDFDoc({
                                            margins: {
                                                top: 0,
                                                bottom: 0,
                                                left: 0,
                                                right: 0
                                            },
                                            autoFirstPage: false,
                                            size,
                                            bufferPages: true,
                                        });
                                        doc.pipe(fs.createWriteStream(name + ".pdf"))
                                        doc.font('./unifont-15.0.01.ttf')
                                        var dir = fs.readdirSync(folder);
                                        dir.sort().forEach((file, idx) => {
                                            doc.addPage();
                                            doc.image(folder + file, {
                                                fit: size,
                                                align: 'center',
                                                valign: 'center'
                                            });
                                            if (selectableText) {
                                                var thePageData = pageData[file.split("-")?.[1]]
                                                var txts = thePageData?.txt?.split("")
                                                txts.forEach((char, idx) => {
                                                    if (thePageData.cds[idx]) {
                                                        var [left, top, width, height] = thePageData.cds[idx].map((l, i, a) => [
                                                            () => a[0] / 1e5,
                                                            () => a[2] / 1e5,
                                                            () => (a[1] / 1e5 - a[0] / 1e5) * ((txts[idx + 1] ?? " ") == " " ? 2 : 1),
                                                            () => a[3] / 1e5 - a[2] / 1e5,
                                                        ][i]()).map((l, i) => Math.round(l * size[i % 2 == 0 ? 0 : 1]));

                                                        if ((txts[idx + 1] ?? " ") == " ") char += " "

                                                        doc.save();
                                                        //doc.rect(left, top, width, height).fillOpacity(0.5).fill("#1e1e1e")

                                                        doc.translate(left, top);

                                                        if (doc.widthOfString(char, {
                                                            lineBreak: false,
                                                        }) > 0 && doc.heightOfString(char, {
                                                            lineBreak: false,
                                                        }) > 0) {
                                                            doc.scale(width / doc.widthOfString(char, {
                                                                lineBreak: false,
                                                            }), height / doc.heightOfString(char, {
                                                                lineBreak: false,
                                                            }))/*.translate(0, (doc.heightOfString(char, {
                                                                lineBreak: false,
                                                            }) / 2));*/

                                                            doc.fillOpacity(0)
                                                            doc.text(char, 0, 0, {
                                                                lineGap: 0,
                                                                paragraphGap: 0,
                                                                lineBreak: false,
                                                                baseline: 'top',
                                                                align: 'left',
                                                            });
                                                        }

                                                        doc.restore();
                                                    }
                                                });


                                            }
                                            console.log(`\x1b[1A\x1b[2K\x1b[1GMerging into PDF (${idx}/${dir.length})`);
                                        });
                                        doc.end();
                                        console.log("Wrote " + name + ".pdf")



                                    }).catch(err => {
                                        console.log(err)
                                        console.log(`Could not load book - 407`)
                                    })
                                }).catch(err => {
                                    console.log(err)
                                    console.log(`Could not load books - 406`)
                                })
                            }).catch(err => {
                                console.log(err)
                                console.log(`Could not tokens - 405`)
                            })
                        }).catch(err => {
                            console.log(err)
                            console.log(`Could not login - 404`)
                        })
                    } else {
                        console.log(`Could not login - 403`)
                    }
                }).catch(err => {
                    console.log(err)
                    console.log(`Could not login - 402`)
                })
            }).catch(err => {
                console.log(err)
                console.log(`Could not login - 401`)
            })


        }).catch(err => {
            console.log(err)
            console.log(`Could not login - 400`)
        })

    }).catch((err) => {
        console.log(err)
        console.log(`Could not login - 399`)
    })
}

var sha256hash = crypto.createHash('sha256');

function randomString(length) {
    let e = "";
    const n = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < length; i++) e += n.charAt(Math.floor(Math.random() * n.length));
    return e
}

function cornelsen(email, passwd, deleteAllOldTempImages) {
    console.log("Logging in and getting Book list")
    const cookieJar = new tough.CookieJar();
    const axiosInstance = axios.create({
        jar: cookieJar,
        withCredentials: true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36',
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
        }
    });
    axiosInstance({
        method: 'get',
        url: 'https://www.cornelsen.de/',
    }).then(res => {
        axiosInstance({
            method: 'get',
            url: 'https://www.cornelsen.de/shop/ccustomer/oauth/autoLogin?timestamp=' + Math.floor(Date.now() / 1000),
        }).then(res => {
            axiosInstance({
                method: 'get',
                url: 'https://www.cornelsen.de/shop/ccustomer/oauth/login/?afterAuthUrl=https%3A%2F%2Fwww.cornelsen.de%2F',
            }).then(res => {
                var parsed = HTMLParser.parse(res.data);
                var loginFormData = {};
                parsed.querySelector("#loginForm").querySelectorAll("input").forEach(i => {
                    loginFormData[i.getAttribute("name")] = i.getAttribute("value") || "";
                })
                loginFormData["loginForm:username"] = email;
                loginFormData["loginForm:password"] = passwd;

                axiosInstance({
                    method: 'post',
                    url: 'https://id.cornelsen.de/oxauth/login.htm',
                    data: qs.stringify(loginFormData)
                }).then(res => {
                    console.log("Logged in successfully")
                    axiosInstance({
                        method: 'get',
                        url: "https://www.cornelsen.de/shop/capiadapter/link/eBibliothek"
                    }).then(res => {
                        axiosInstance({
                            method: 'get',
                            url: "https://mein.cornelsen.de/609.af0a30995390739a5507.js"
                        }).then(res => {
                            var clientId = res.data.match(/authority\s*:\s*"https:\/\/id.cornelsen.de\/"\s*,\s*clientId\s*:\s*"(.*?)"/m)[1];
                            console.log("Got client id: " + clientId)
                            var code_verifier = crypto.randomBytes(48).toString('hex');
                            axiosInstance({
                                method: "get",
                                url: "https://id.cornelsen.de/oxauth/restv1/authorize",
                                params: {
                                    scope: "openid user_name roles cv_sap_kdnr cv_schule profile email meta inum",
                                    response_type: "code",
                                    response_mode: "query",
                                    redirect_uri: "https://mein.cornelsen.de",
                                    client_id: clientId,
                                    state: crypto.randomBytes(16).toString('hex'),
                                    code_challenge: crypto.createHash('sha256').update(code_verifier).digest().toString('base64url'),
                                    code_challenge_method: "S256",
                                },
                                //disable redirects
                                maxRedirects: 0,
                                validateStatus: (status) => {
                                    return status >= 200 && status < 303;
                                }
                            }).then(res => {
                                var code = res.headers.location.match(/code=(.*?)&/)[1];
                                console.log("Got code: " + code)
                                axiosInstance({
                                    method: 'post',
                                    url: "https://id.cornelsen.de/oxauth/restv1/token",
                                    headers: {
                                        "content-type": "application/x-www-form-urlencoded",
                                    },
                                    data: qs.stringify({
                                        grant_type: "authorization_code",
                                        redirect_uri: "https://mein.cornelsen.de",
                                        code: code,
                                        code_verifier: code_verifier,
                                        client_id: clientId,
                                    })
                                }).then(res => {
                                    var id_token = res.data.id_token;
                                    console.log("Got access token: " + id_token)

                                    //console.log(cookieJar.toJSON().cookies.find(c => c.key == "cornelsen-jwt").value);
                                    axiosInstance({
                                        method: 'post',
                                        url: 'https://mein.cornelsen.de/bibliothek/api',
                                        headers: {
                                            "authorization": "Bearer " + id_token,//cookieJar.toJSON().cookies.find(c => c.key == "cornelsen-jwt").value,
                                            "content-type": "application/json",
                                            "accept": "*/*",
                                            "origin": "https://mein.cornelsen.de",
                                        },
                                        data: {
                                            operationName: "licenses",
                                            query: "query licenses {\n  licenses {\n    activeUntil\n    isExpired\n    isNew\n    coverUrl\n    canBeStarted\n    salesProduct {\n      id\n      url\n      heading\n      shortTitle\n      subheading\n      info\n      coverUrl\n      licenseModelId\n      fullVersionId\n      fullVersionUrl\n      __typename\n    }\n    usageProduct {\n      id\n      url\n      heading\n      shortTitle\n      subheading\n      info\n      coverUrl\n      usagePlatformId\n      __typename\n    }\n    __typename\n  }\n}\n",
                                            variables: {}
                                        }
                                    }).then(res => {
                                        //fs.writeFileSync("./cornelsen.json", JSON.stringify(res.data, null, 2));
                                        prompts([{
                                            type: (prev, values) => values.publisher == "cornelsen" ? null : 'autocomplete',
                                            name: 'license',
                                            message: "Book",
                                            choices: res.data?.data?.licenses?.map(l => {
                                                return {
                                                    title: (l?.usageProduct?.heading || l?.salesProduct?.heading) + " - " + (l?.usageProduct?.subheading || l?.salesProduct?.subheading),
                                                    value: l
                                                }
                                            })
                                        }]).then(async values => {
                                            axiosInstance({
                                                method: 'post',
                                                url: 'https://mein.cornelsen.de/bibliothek/api',
                                                headers: {
                                                    "authorization": "Bearer " + id_token, //cookieJar.toJSON().cookies.find(c => c.key == "cornelsen-jwt").value,
                                                    "content-type": "application/json",
                                                    "accept": "*/*",
                                                    "origin": "https://mein.cornelsen.de",
                                                },
                                                data: {
                                                    operationName: "startProduct",
                                                    query: "mutation startProduct($productId: ProductId!) {\n  startProduct(productId: $productId)\n}\n",
                                                    variables: {
                                                        productId: values.license?.usageProduct?.id || values.license?.salesProduct?.id
                                                    }
                                                }
                                            }).then((res) => {
                                                console.log("Loading possible qualities")
                                                var name = (values.license?.usageProduct?.heading || values.license?.salesProduct?.heading) + " - " + (values.license?.usageProduct?.subheading || values.license?.salesProduct?.subheading);
                                                axiosInstance({
                                                    method: 'get',
                                                    url: res.data?.data?.startProduct
                                                    //url: 'https://produkte.cornelsen.de/url/' + values.license?.usageProduct?.usagePlatformId + "/" + values.license?.usageProduct?.id + "/",
                                                }).then(res => {
                                                    axiosInstance({
                                                        url: "https://ebook.cornelsen.de/uma20/api/v2/umas/" + values.license?.usageProduct?.id,
                                                        method: "get",
                                                        headers: {
                                                            "authorization": "Bearer " + id_token,//cookieJar.toJSON().cookies.find(c => c.key == "cornelsen-jwt").value,
                                                            "content-type": "application/json",
                                                            "accept": "*/*",
                                                        }
                                                    }).then(res => {
                                                        var bookData = res.data
                                                        axiosInstance({
                                                            method: 'get',
                                                            url: `https://ebook.cornelsen.de/uma20/api/v2/pspdfkitjwt/${bookData.module?.moduleIsbn}/${bookData.ebookIsbnSbNum}`,
                                                            headers: {
                                                                "accept": "application/json",
                                                                "x-cv-app-identifier": "uma_web_2023.15.1",
                                                                "authorization": "Bearer " + id_token,//cookieJar.toJSON().cookies.find(c => c.key == "cornelsen-jwt").value,
                                                            }
                                                        }).then(res => {
                                                            var pspdfkitjwt = res.data
                                                            console.log("Got pspdfkitjwt: " + pspdfkitjwt)
                                                            axiosInstance({
                                                                method: 'post',
                                                                url: `https://pspdfkit.prod.cornelsen.de/i/d/${bookData.ebookIsbnSbNum}/auth`,
                                                                data: {
                                                                    "jwt": pspdfkitjwt,
                                                                    "origin": `https://ebook.cornelsen.de/${bookData.module?.moduleIsbn}/start`
                                                                },
                                                                headers: {
                                                                    "pspdfkit-platform": "web",
                                                                    "pspdfkit-version": "protocol=5, client=2023.3.1, client-git=132691d67f",
                                                                    "referer": "https://ebook.cornelsen.de/",
                                                                    "origin": "https://ebook.cornelsen.de",
                                                                }
                                                            }).then(res => {
                                                                var pspdfkitauthdata = res.data;
                                                                //var qualityScale = quality < pspdfkitauthdata.allowedTileScales.length ? pspdfkitauthdata.allowedTileScales.reverse()[quality] : pspdfkitauthdata.allowedTileScales[0];
                                                                axiosInstance({
                                                                    method: 'get',
                                                                    url: `https://pspdfkit.prod.cornelsen.de/i/d/${bookData.ebookIsbnSbNum}/h/${pspdfkitauthdata.layerHandle}/document.json`,
                                                                    headers: {
                                                                        "pspdfkit-platform": "web",
                                                                        "pspdfkit-version": "protocol=5, client=2023.3.1, client-git=132691d67f",
                                                                        "X-PSPDFKit-Token": pspdfkitauthdata.token,
                                                                    }
                                                                }).then(res => {
                                                                    var pagesData = res.data.data;
                                                                    prompts([{
                                                                        type: 'select',
                                                                        name: 'quality',
                                                                        message: "Quality",
                                                                        choices: pspdfkitauthdata.allowedTileScales.map(q => {
                                                                            return {
                                                                                title: `${Math.floor(pagesData.pages[0].width * q)} x ${Math.floor(pagesData.pages[0].height * q)}`,
                                                                                value: q
                                                                            }
                                                                        })
                                                                    }, {
                                                                        type: "text",
                                                                        name: "extension",
                                                                        message: "Image File Extension",
                                                                        initial: "jpg",
                                                                    }, {
                                                                        type: "text",
                                                                        name: "magickquality",
                                                                        message: "Image Magick Quality in % (100% - 100% of size, 95% - 40% of size, 90% - 25% of size, 85% - 15% of size)",
                                                                        initial: "90",
                                                                    }, {
                                                                        type: "toggle",
                                                                        name: "selectableText",
                                                                        message: "Selectable Text",
                                                                        initial: true,
                                                                    }]).then(values2 => {
                                                                        var filename = name.replace(/[^a-zA-Z0-9 \(\)_\-,\.]/gi, '') + `_${Math.floor(pagesData.pages[0].width * values2.quality)}x${Math.floor(pagesData.pages[0].height * values2.quality)}_${values2.magickquality}q`;
                                                                        var tmpFolder = "./DownloadTemp/" + filename + "/";
                                                                        if (deleteAllOldTempImages && fs.existsSync(tmpFolder)) fs.rmSync(tmpFolder, {
                                                                            recursive: true,
                                                                        });
                                                                        fs.mkdir(tmpFolder, {
                                                                            recursive: true
                                                                        }, async () => {
                                                                            /*Promise.all(pagesData.pages.map(p => {
                                                                                return new Promise((resolve, reject) => {
                                                                                    axiosInstance({
                                                                                        method: 'get',
                                                                                        url: `https://pspdfkit.prod.cornelsen.de/i/d/${values.license?.salesProduct?.fullVersionId}/h/${pspdfkitauthdata.layerHandle}/page-${p.pageIndex}-dimensions-${Math.floor(p.width * values2.quality)}-${Math.floor(p.height * values2.quality)}-tile-0-0-${Math.floor(p.width * values2.quality)}-${Math.floor(p.height * values2.quality)}`,
                                                                                        headers: {
                                                                                            "x-pspdfkit-image-token": pspdfkitauthdata.imageToken,
                                                                                            "Accept": "image/webp,*//*",
                                                                                            "Referer": "https://ebook.cornelsen.de/",
                                                                                        },
                                                                                        responseType: 'stream',
                                                                                        timeout: 60000,
                                                                                        httpsAgent: new https.Agent({ keepAlive: true }),
                                                                                    }).then(res => {
                                                                                        //fs.createWriteStream(`${tmpFolder}${zeroPad(p.pageIndex, 4)}-${p.pageLabel}.webp`).write(res.data);
                                                                                        res.data.pipe(fs.createWriteStream(`${tmpFolder}${zeroPad(p.pageIndex, 4)}-${p.pageLabel}.webp`))
                                                                                        resolve();
                                                                                    }).catch(err => {
                                                                                        console.log(`Could not load page ${p.pageIndex} - 760`)
                                                                                        console.log(err)
                                                                                        reject();
                                                                                    })
                                                                                })
                                                                            })).then(() => {
                                                                                console.log(`Downloaded all Pages`)
                                                                            }).catch(err => {
                                                                                console.log(`Could not load all pages - 761`)
                                                                                console.log(err)
                                                                            })*/

                                                                            var pagesText = {};

                                                                            var errored = false;
                                                                            console.log(`Downloaded 0/${pagesData.pages.length}`)
                                                                            var pi = 0;
                                                                            for (p of pagesData.pages) {
                                                                                pi++;
                                                                                if (errored) {
                                                                                    break;
                                                                                }
                                                                                await new Promise((resolve, reject) => {
                                                                                    axiosInstance({
                                                                                        method: 'get',
                                                                                        url: `https://pspdfkit.prod.cornelsen.de/i/d/${bookData.ebookIsbnSbNum}/h/${pspdfkitauthdata.layerHandle}/page-${p.pageIndex}-dimensions-${Math.floor(p.width * values2.quality)}-${Math.floor(p.height * values2.quality)}-tile-0-0-${Math.floor(p.width * values2.quality)}-${Math.floor(p.height * values2.quality)}`,
                                                                                        headers: {
                                                                                            "x-pspdfkit-image-token": pspdfkitauthdata.imageToken,
                                                                                            "Accept": "image/webp,*/*",
                                                                                            "Referer": "https://ebook.cornelsen.de/",
                                                                                        },
                                                                                        responseType: 'stream',
                                                                                    }).then(res => {
                                                                                        var imageFile = `${tmpFolder}${zeroPad(p.pageIndex, 4)}-${p.pageLabel}.jpg`;
                                                                                        magickProcess = spawn("magick", ["-", "-quality", `${values2.magickquality}%`, `${values2.extension}:-`]);
                                                                                        ffmpegProcess = spawn("ffmpeg", ["-f", "jpeg_pipe", "-i", "-", "-f", "image2", "-"]);

                                                                                        ffmpegProcess.stdout.pipe(fs.createWriteStream(imageFile)).on('finish', (s) => {

                                                                                            if (values2.selectableText) {
                                                                                                axiosInstance({
                                                                                                    method: 'get',
                                                                                                    url: `https://pspdfkit.prod.cornelsen.de/i/d/${bookData.ebookIsbnSbNum}/h/${pspdfkitauthdata.layerHandle}/page-${p.pageIndex}-text`,
                                                                                                    headers: {
                                                                                                        "X-PSPDFKit-Token": pspdfkitauthdata.token,
                                                                                                        "Accept": "image/webp,*/*",
                                                                                                        "Referer": "https://ebook.cornelsen.de/",
                                                                                                    },
                                                                                                }).then(res => {
                                                                                                    pagesText[p.pageIndex] = res.data?.textLines;
                                                                                                    resolve();
                                                                                                }).catch(err => {
                                                                                                    console.log(`Could not load page ${p.pageIndex} text - 763`)
                                                                                                    errored = true;
                                                                                                    resolve();
                                                                                                    console.log(err)
                                                                                                });
                                                                                            } else {
                                                                                                resolve();
                                                                                            }
                                                                                        }).on('error', (err) => {
                                                                                            console.log(`Could not save page ${p.pageIndex} - 762`)
                                                                                            console.log("error")
                                                                                            console.log(err)
                                                                                            errored = true;
                                                                                            resolve();
                                                                                        })
                                                                                        magickProcess.stdout.pipe(ffmpegProcess.stdin)
                                                                                        res.data.pipe(magickProcess.stdin)
                                                                                    }).catch(err => {
                                                                                        console.log(`Could not load page ${p.pageIndex} - 760`)
                                                                                        errored = true;
                                                                                        resolve();
                                                                                        console.log(err)
                                                                                    })
                                                                                })
                                                                                console.log(`\x1b[1A\x1b[2K\x1b[1GDownloaded ${pi}/${pagesData.pages.length} pages`)
                                                                            }
                                                                            if (errored) {
                                                                                console.log(`Could not load all pages - 761`)
                                                                            } else {
                                                                                console.log(`Downloaded all Pages, now creating PDF Document`)
                                                                                var doc = new PDFDoc({
                                                                                    margins: {
                                                                                        top: 0,
                                                                                        bottom: 0,
                                                                                        left: 0,
                                                                                        right: 0
                                                                                    },
                                                                                    autoFirstPage: false,
                                                                                    size: [pagesData.pages[0].width, pagesData.pages[0].height]
                                                                                });
                                                                                doc.pipe(fs.createWriteStream(filename + ".pdf"))
                                                                                doc.font('./unifont-15.0.01.ttf')
                                                                                var dir = fs.readdirSync(tmpFolder);
                                                                                dir.sort().forEach((file, idx) => {
                                                                                    doc.addPage();
                                                                                    doc.image(tmpFolder + file, {
                                                                                        fit: [pagesData.pages[0].width, pagesData.pages[0].height],
                                                                                        align: 'center',
                                                                                        valign: 'center'
                                                                                    });
                                                                                    if (values2.selectableText) {
                                                                                        pagesText[/*idx*/ parseInt(file.split("-")[0])].forEach(line => {
                                                                                            if (line.contents.length > 0) {
                                                                                                doc.save();
                                                                                                //doc.rect(line.left, line.top, line.width, line.height).fillOpacity(0.5).fill("#1e1e1e")

                                                                                                doc.translate(line.left, line.top);
                                                                                                if (line.height > line.width && line.height / line.contents.length < line.width) {
                                                                                                    doc.rotate(90).scale(line.height / doc.widthOfString(line.contents, {
                                                                                                        lineBreak: false,
                                                                                                    }), line.width / doc.heightOfString(line.contents, {
                                                                                                        lineBreak: false,
                                                                                                    })).translate(0, -(doc.heightOfString(line.contents, {
                                                                                                        lineBreak: false,
                                                                                                    }) / 2))
                                                                                                } else {
                                                                                                    try {
                                                                                                        doc.scale(line.width / doc.widthOfString(line.contents, {
                                                                                                            lineBreak: false,
                                                                                                        }), line.height / doc.heightOfString(line.contents, {
                                                                                                            lineBreak: false,
                                                                                                        })).translate(0, (doc.heightOfString(line.contents, {
                                                                                                            lineBreak: false,
                                                                                                        }) / 2));
                                                                                                    } catch (err) {
                                                                                                        console.log(err);
                                                                                                        console.log(line.contents, line.left, line.top, line.width, line.height);
                                                                                                        process.exit(1);
                                                                                                    }
                                                                                                }
                                                                                                doc.fillOpacity(0)
                                                                                                doc.text(line.contents, 0, 0, {
                                                                                                    lineGap: 0,
                                                                                                    paragraphGap: 0,
                                                                                                    lineBreak: false,
                                                                                                    baseline: 'middle',
                                                                                                    align: 'left',
                                                                                                });
                                                                                                doc.restore();
                                                                                            }
                                                                                        });


                                                                                    }
                                                                                });
                                                                                doc.end();
                                                                                console.log(`finished creating PDF Document, saved at: ${filename}.pdf`)
                                                                            }
                                                                        });
                                                                    })
                                                                }).catch(err => {
                                                                    console.log("Could not load book pages - 761")
                                                                    console.log(err)
                                                                });
                                                            }).catch(err => {
                                                                console.log("Could not authenticate PSPDFKIT - 760")
                                                                console.log(err)
                                                            });
                                                        }).catch(err => {
                                                            console.log("Could not authenticate PSPDFKIT - 759")
                                                            console.log(err)
                                                        });
                                                    }).catch(err => {
                                                        console.log("Could not load book data - 758")
                                                        console.log(err)
                                                    })
                                                }).catch(err => {
                                                    console.log("Could not load book - 757")
                                                    console.log(err)
                                                });
                                            }).catch(err => {
                                                console.log("Could not start product - 756")
                                                console.log(err)
                                            })
                                        });
                                    }).catch(err => {
                                        console.log("Could not get library - 755")
                                        console.log(err)
                                    });
                                }).catch(err => {
                                    console.log(err)
                                    console.log(`Could not get token - 754.3`)
                                })
                            }).catch(err => {
                                console.log(err)
                                console.log(`Could not authorize code_challenge - 754.2`)
                            })
                        }).catch(err => {
                            console.log(err)
                            console.log(`Could not load 609.af0a30995390739a5507.js - 754.1`)
                        })
                    }).catch(err => {
                        console.log("Could not get library - 754")
                        console.log(err)
                    });
                }).catch(err => {
                    console.log("Could not login - 753")
                    console.log(err)
                });
            }).catch(err => {
                console.log("Could not login - 752")
                console.log(err)
            });
        }).catch(err => {
            console.log("Could not login - 751")
            console.log(err)
        });
    }).catch(err => {
        console.log("Could not connect - 750")
        console.log(err)
    });
}
async function klett(email, passwd, deleteAllOldTempImages) {
    const cookieJar = new tough.CookieJar();
    axios({
        url: "https://schueler.klett.de/arbeitsplatz/",
        method: "get",
        jar: cookieJar,
        withCredentials: true,
    }).then(res => {
        var loginForm = HTMLParser.parse(res.data).querySelector("#kc-form-login").attributes;
        axios({
            url: loginForm.action,
            method: loginForm.method,
            jar: cookieJar,
            withCredentials: true,
            data: qs.stringify({
                username: email,
                password: passwd,
                renemberMe: "on"
            }),
            headers: {
                'content-type': "application/x-www-form-urlencoded"
            }
        }).then(res => {
            axios({
                url: "https://www.klett.de/drm/api/1.0/private/license/usage?size=50&page=1&valid=true",
                jar: cookieJar,
                withCredentials: true,
            }).then(async res => {
                var choices = [];
                for (let l of res.data?.items) {
                    choices.push(await new Promise((resolve, rej) => {
                        axios({
                            url: l?.["_links"]?.["produkt"]?.["href"],
                            jar: cookieJar,
                            withCredentials: true,
                        }).then(res => {
                            resolve({
                                title: res.data?.titel + " - " + res.data?.untertitel,
                                value: { dienst_id: l.dienst_id, title: res.data?.titel + " - " + res.data?.untertitel }
                            })
                        }).catch(err => {
                            console.log(err);
                            console.log("Error fetching book info")
                        })
                    }))
                }
                prompts([{
                    type: 'autocomplete',
                    name: 'license',
                    message: "Book",
                    choices
                }]).then(values => {
                    axios({
                        url: "https://bridge.klett.de/" + values.license.dienst_id + "/",
                        method: "get",
                        jar: cookieJar,
                        withCredentials: true,
                        headers: {
                            'user-agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.3325.181 Safari/537.36",
                            'sec-ch-ua-platform': "Windows",
                            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
                        }
                    }).then(async (res) => {
                        //fs.writeFileSync("./sas", res.data);
                        //Promise.all(HTMLParser.parse(res.data).querySelector(".viewport").querySelector(".zoomable").querySelector(".pages").childNodes.map(pageNode => {
                        var mainpagehtml = HTMLParser.parse(res.data);
                        var settingsJSON = JSON.parse(mainpagehtml.querySelector("#settings-json").innerText);
                        //console.log(settingsJSON);

                        var size;
                        /** @type {{[page: number]: {height: number, width: number, x: number, y: number, url: string}[]}} */
                        var hyperlinks = {};
                        /** @type {{[page: number]: {text: string, wordPositionSvg: string}}} */
                        var selectableText = {};

                        var bothPrompts = await prompts([{
                            type: "toggle",
                            name: "selectableText",
                            message: "Selectable text",
                            initial: true,
                        }, {
                            type: "toggle",
                            name: "hyperlinks",
                            message: "Hyperlinks",
                            initial: true,
                        }])

                        if (parseInt(settingsJSON.buildYear) >= 2021) {

                            console.log("starting new downloader")

                            var values2 = await prompts([{
                                type: 'select',
                                name: 'quality',
                                message: "quality",
                                choices: settingsJSON?.pages?.resolutions.sort((a, b) => b.scale - a.scale).map(q => {
                                    return {
                                        title: `${q.width} x ${q.height} (Scale ${q.scale})`,
                                        value: q
                                    }
                                })
                            }])


                            var name = values.license.title.replace(/[^a-zA-Z0-9 \(\)_\-,\.]/gi, '') + "_" + `${values2.quality.width}x${values2.quality.height}`;
                            var folder = ("./DownloadTemp/" + name + "/");
                            if (deleteAllOldTempImages && fs.existsSync(folder)) fs.rmSync(folder, {
                                recursive: true,
                            });
                            console.log("Deleted Temp files");
                            fs.mkdirSync(folder, {
                                recursive: true
                            });
                            console.log("created Folder: " + folder)


                            var titles = settingsJSON.pages.titles;
                            var imgExtension = values2.quality.path.split(".").slice(-1);

                            console.log(`Downloaded 0/${titles.length}`)
                            for (let pi in titles) {
                                await new Promise((resolve, reject) => {
                                    axios({
                                        url: "https://bridge.klett.de/" + values.license.dienst_id + "/" + values2.quality.path.replace("${page}", pi),
                                        method: "get",
                                        jar: cookieJar,
                                        withCredentials: true,
                                        responseType: 'stream',
                                        withCredentials: true,
                                    }).then((res) => {
                                        res.data.pipe(fs.createWriteStream(folder + zeroPad(pi, 4) + "-" + titles[pi] + "." + imgExtension)).on('finish', () => {
                                            console.log(`\x1b[1A\x1b[2K\x1b[1GDownloaded ${parseInt(pi) + 1}/${titles.length} pages`)
                                            resolve();
                                        })
                                    }).catch(err => {
                                        console.log(err);
                                        console.log("Error downloading page " + pi + " - " + titles[pi])
                                        resolve();
                                    })
                                });

                            }
                            console.log("Downloaded all images");

                            var dataJson;

                            if (bothPrompts.selectableText || bothPrompts.hyperlinks) {
                                console.log("Downloading pages text");

                                dataJson = await new Promise((resolve, reject) => {
                                    axios({
                                        url: "https://bridge.klett.de/" + values.license.dienst_id + "/data.json",
                                        method: "get",
                                        jar: cookieJar,
                                        withCredentials: true
                                    }).then(async (res) => {
                                        //resolve(JSON.parse(new Iconv('UTF-8', 'ISO-8859-1//TRANSLIT//IGNORE').convert(res.data).toString("utf-8")));
                                        resolve(res.data)
                                    }).catch(err => {
                                        console.log(err);
                                        console.log("Error downloading pages text")
                                        resolve();
                                    });
                                });
                            }

                            if (bothPrompts.hyperlinks) {
                                dataJson.pages.forEach((page, idx) => {
                                    if (page.layers?.[0]?.areas?.length) {
                                        hyperlinks[idx] = page.layers?.[0]?.areas.map(a => {
                                            a.url = a.url ?? ""
                                            return a;
                                        });
                                    }
                                });
                            }
                            if (bothPrompts.selectableText) {
                                for (var i = 0; i < dataJson.pages.length; i++) {
                                    var page = dataJson.pages[i];
                                    if (page.content && page.content.text && page.content.wordPositionSvg) {
                                        selectableText[i] = {
                                            text: new Iconv('UTF-8', 'ISO-8859-1//TRANSLIT//IGNORE').convert(page.content.text).toString("utf-8"),
                                            wordPositionSvg: page.content.wordPositionSvg
                                        };
                                    }
                                }
                            }

                            size = [values2.quality.width / values2.quality.scale, values2.quality.height / values2.quality.scale];

                            //console.log(values2)

                        } else {
                            console.log("starting old downloader")

                            var values2 = await prompts([{
                                type: 'select',
                                name: 'quality',
                                message: "quality",
                                choices: [4, 2, 1].map(q => {
                                    return {
                                        title: `${768 * q} x ${1024 * q} (Scale ${q})`,
                                        value: q
                                    }
                                })
                            }])

                            var name = values.license.title.replace(/[^a-zA-Z0-9 \(\)_\-,\.]/gi, '') + "_" + `${768 * values2.quality}x${1024 * values2.quality}`;
                            var folder = ("./DownloadTemp/" + name + "/");
                            if (deleteAllOldTempImages && fs.existsSync(folder)) fs.rmSync(folder, {
                                recursive: true,
                            });
                            console.log("Deleted Temp files");
                            fs.mkdirSync(folder, {
                                recursive: true
                            });
                            console.log("created Folder: " + folder)

                            var pagesNode = mainpagehtml.querySelector(".viewport").querySelector(".zoomable").querySelector(".pages").childNodes;

                            console.log(`Downloaded 0/${pagesNode.length}`)
                            var offset = 0;
                            for (var pi in pagesNode) {
                                var pageNode = pagesNode[pi];
                                await new Promise((resolve, reject) => {
                                    if (pageNode.querySelector(".content")) {

                                        if (bothPrompts.hyperlinks) {
                                            var hyperlinksLayer = pageNode.querySelector(".content").querySelector(".annotation-layers")?.querySelector(".Sprungmarke");

                                            hyperlinksLayer && (hyperlinks[parseInt(pi) + offset] = hyperlinksLayer.querySelectorAll("a")?.map(a => {
                                                var style = Object.fromEntries(a.getAttribute("style").split(";").map(s => s.trim().split(":").map(si => si.trim())));
                                                //console.log(style)
                                                return {
                                                    x: parseFloat(l = style["left"]) / (l.includes("%") ? 100 : 1),
                                                    y: parseFloat(l = style["top"]) / (l.includes("%") ? 100 : 1),
                                                    width: parseFloat(l = style["width"]) / (l.includes("%") ? 100 : 1),
                                                    height: parseFloat(l = style["height"]) / (l.includes("%") ? 100 : 1),
                                                    url: a.getAttribute("href") ?? "",
                                                }
                                            }))
                                        }

                                        if (bothPrompts.selectableText) {
                                            var searchable = pageNode.querySelector(".content").querySelector(".searchable");
                                            if (searchable && searchable.querySelector(".text") && searchable.querySelector("link")) {
                                                selectableText[parseInt(pi) + offset] = {
                                                    //text: new Iconv("utf-8", "utf-8//TRANSLIT//IGNORE").convert(searchable.querySelector(".text").innerText).toString("utf-8"),
                                                    text: searchable.querySelector(".text").innerText.replace(/\uFFFF/g, 'i'),
                                                    wordPositionSvg: searchable.querySelector("link").getAttribute("href")
                                                };
                                            }
                                        }

                                        var imgs = pageNode.querySelector(".content").querySelector(".image-layers").childNodes.map(nd => nd.childNodes[0].getAttribute("style").split("'")[1]);
                                        //var img = (imgs[quality] || imgs.slice(-1)[0]);
                                        var img = imgs.find(img => img.includes("Scale" + values2.quality))
                                        axios({
                                            url: "https://bridge.klett.de/" + values.license.dienst_id + "/" + img,
                                            method: "get",
                                            jar: cookieJar,
                                            withCredentials: true,
                                            responseType: 'stream',
                                            withCredentials: true,
                                        }).then((res) => {
                                            var extension = img.split(".").slice(-1);
                                            res.data.pipe(fs.createWriteStream(folder + zeroPad(pageNode.getAttribute("data-pos"), 4) + "-" + pageNode.getAttribute("data-title") + "." + extension)).on('finish', () => {
                                                console.log(`\x1b[1A\x1b[2K\x1b[1GDownloaded ${parseInt(pi) + 1}/${pagesNode.length} pages`)
                                                resolve();
                                            })
                                        }).catch(err => {
                                            console.log(err);
                                            console.log("error downloading" + zeroPad(pageNode.getAttribute("data-pos"), 4) + "-" + pageNode.getAttribute("data-title"))
                                        })
                                    } else {
                                        offset--;
                                        resolve();
                                    }
                                });
                            }
                            console.log("Downloaded all images");

                            size = [768, 1024];
                        }

                        var selectableTextElements = [];

                        if (bothPrompts.selectableText) {
                            console.log(`Downloading selectable text positions (${0}/${Object.keys(selectableText).length})`);
                            var i = 0;
                            for (var st of Object.keys(selectableText)) {
                                i++;
                                var m
                                var svg = await new Promise(m = (resolve, reject) => {
                                    axios({
                                        url: "https://bridge.klett.de/" + values.license.dienst_id + "/" + selectableText[st].wordPositionSvg,
                                        method: "get",
                                        jar: cookieJar,
                                        withCredentials: true,
                                    }).then(res => {
                                        resolve(res.data);
                                    }).catch(err => {
                                        console.log(err);
                                        console.log("Error selectable text positions");
                                        m(resolve, reject);
                                    });
                                });
                                var parsedSVG = HTMLParser.parse(svg);
                                selectableText[st].text.split(" ").forEach((text, idx) => {
                                    var path = parsedSVG.querySelector("#p" + (parseInt(st) + 1) + "w" + (idx + 1))?.getAttribute("d");
                                    var spltPaths = path?.split(/[zZ]/)?.filter(f => f)?.map(f => f.split(/(?=[a-zA-Z])/)?.map(s => [s[0], s.slice(1)?.split(" ")]));


                                    var boxes = spltPaths?.map(sp => {
                                        var minX = undefined;
                                        var maxX = undefined;
                                        var minY = undefined;
                                        var maxY = undefined;
                                        var x = 0;
                                        var y = 0;
                                        if (sp) for (var s of sp) {
                                            switch (s[0]) {
                                                case "M":
                                                case "L":
                                                    x = parseFloat(s[1][0]);
                                                    y = parseFloat(s[1][1]);
                                                    break;
                                                case "m":
                                                case "l":
                                                    x += parseFloat(s[1][0]);
                                                    y += parseFloat(s[1][1]);
                                                    break;
                                                case "H":
                                                    x = parseFloat(s[1][0]);
                                                    break;
                                                case "h":
                                                    x += parseFloat(s[1][0]);
                                                    break;
                                                case "V":
                                                    y = parseFloat(s[1][0]);
                                                    break;
                                                case "v":
                                                    y += parseFloat(s[1][0]);
                                                    break;
                                            }
                                            if (minX === undefined || x < minX) minX = x;
                                            if (maxX === undefined || x > maxX) maxX = x;
                                            if (minY === undefined || y < minY) minY = y;
                                            if (maxY === undefined || y > maxY) maxY = y;
                                        }
                                        return {
                                            left: minX,
                                            top: minY,
                                            width: maxX - minX,
                                            height: maxY - minY,
                                        }
                                    });

                                    var summedWidth = boxes?.reduce((a, b) => a + b.width, 0);
                                    var i = 0;
                                    boxes?.forEach(b => {
                                        var j = i + Math.round((b.width / summedWidth) * text.length)
                                        b.contents = text.slice(i, j);
                                        i = j;
                                        if (!selectableTextElements[st]) selectableTextElements[st] = []
                                        selectableTextElements[st].push(b)
                                    })
                                });
                                console.log(`\x1b[1A\x1b[2K\x1b[1GDownloading selectable text positions (${i}/${Object.keys(selectableText).length})`);
                            }
                        } else {
                            await new Promise((resolve, reject) => {
                                setTimeout(() => { // wait for pipes to finish (needs better handling)
                                    resolve();
                                }, 2000);
                            });
                        }

                        console.log("Merging into PDF");

                        var doc = new PDFDoc({
                            margins: {
                                top: 0,
                                bottom: 0,
                                left: 0,
                                right: 0
                            },
                            autoFirstPage: false,
                            size,
                            bufferPages: true,
                        });
                        doc.pipe(fs.createWriteStream(name + ".pdf"))
                        doc.font('./unifont-15.0.01.ttf')
                        var dir = fs.readdirSync(folder);
                        dir.sort().forEach((file, idx) => {
                            doc.addPage();
                            doc.image(folder + file, {
                                fit: size,
                                align: 'center',
                                valign: 'center'
                            });
                            if (bothPrompts.selectableText) {
                                selectableTextElements[/*parseInt(file.split("-")[0])*/ idx]?.forEach(line => {
                                    if (line.width && line.height && line.left && line.top && line.contents && line.contents.length > 0) {
                                        doc.save();
                                        //doc.rect(line.left, line.top, line.width, line.height).fillOpacity(0.5).fill("#1e1e1e")

                                        doc.translate(line.left, line.top);
                                        if (line.height > line.width * 2 && line.height / line.contents.length < line.width) {
                                            doc.rotate(90).scale(line.height / doc.widthOfString(line.contents, {
                                                lineBreak: false,
                                            }), line.width / doc.heightOfString(line.contents, {
                                                lineBreak: false,
                                            })).translate(0, -(doc.heightOfString(line.contents, {
                                                lineBreak: false,
                                            }) / 2))
                                        } else {
                                            try {
                                                if (doc.widthOfString(line.contents, {
                                                    lineBreak: false,
                                                }) > 0 && doc.heightOfString(line.contents, {
                                                    lineBreak: false,
                                                }) > 0)
                                                    doc.scale(line.width / doc.widthOfString(line.contents, {
                                                        lineBreak: false,
                                                    }), line.height / doc.heightOfString(line.contents, {
                                                        lineBreak: false,
                                                    })).translate(0, (doc.heightOfString(line.contents, {
                                                        lineBreak: false,
                                                    }) / 2));
                                            } catch (err) {
                                                console.log(err);
                                                console.log(line.contents, line.left, line.top, line.width, line.height);
                                                process.exit(1);
                                            }
                                        }
                                        doc.fillOpacity(0)
                                        doc.text(line.contents, 0, 0, {
                                            lineGap: 0,
                                            paragraphGap: 0,
                                            lineBreak: false,
                                            baseline: 'middle',
                                            align: 'left',
                                        });
                                        doc.restore();
                                    }
                                });


                            }
                            console.log(`\x1b[1A\x1b[2K\x1b[1GMerging into PDF (${idx}/${dir.length})`);
                        });
                        if (bothPrompts.hyperlinks) {
                            console.log("Adding Hyperlinks")
                            dir.sort().forEach((file, idx) => {
                                doc.switchToPage(idx);
                                hyperlinks[idx]?.forEach(area => {
                                    var x = area.x * size[0];
                                    var y = area.y * size[1];
                                    var w = area.width * size[0];
                                    var h = area.height * size[1];
                                    if (area.url.startsWith("?page=") && (toPage = parseInt(area.url.split("=")[1]) - 1) && toPage < doc.bufferedPageRange().start + doc.bufferedPageRange().count) {
                                        doc.link(x, y, w, h, toPage);
                                    } else {
                                        doc.link(x, y, w, h, area.url);
                                    }
                                });
                                console.log(`\x1b[1A\x1b[2K\x1b[1GAdding Hyperlinks (${idx}/${dir.length})`);
                            });
                        }
                        doc.end();
                        console.log("Wrote " + name + ".pdf")
                    }).catch(err => {
                        console.log(err);
                        console.log("Error fetching pages")
                    });
                });
            }).catch(err => {
                console.log(err);
                console.log("Error fetching books")
            });
        }).catch(err => {
            console.log("Error while login")
        });
    }).catch(err => {
        console.log(err);
        console.log("Error fetching loginForm")
    });
}
async function scook(email, passwd, deleteAllOldTempImages) {
    var prmpts = await prompts([
        {
            type: 'number',
            name: 'quality',
            message: "quality (0 = best quality)",
        },
        {
            type: 'autocomplete',
            name: 'isbn',
            message: "Book",
            choices: [
                {
                    title: 'Deutsch Klasse 9',
                    value: '9783060626410'
                }, {
                    title: 'Englisch Klasse 9',
                    value: '9783060328109'
                },
                {
                    title: 'ISBN',
                    value: 'customisbn'
                }
            ]
        },
        {
            type: (prev, values) => prev == "customisbn" ? "text" : null,
            name: 'isbn',
            message: (prev, values) => 'ISBN'
        }
    ])

    var quality = prmpts.quality;
    var isbn = prmpts.isbn;

    const cookieJar = new tough.CookieJar();
    axios({
        url: "https://www.scook.de/action/scook/148/action/actionLogin",
        method: "post",
        jar: cookieJar,
        headers: {
            'content-type': "application/x-www-form-urlencoded"
        },
        data: qs.stringify({
            mail: email,
            password: passwd,
            _rememberMe: "on"
        }),
        withCredentials: true,
    }).then((res) => {
        console.log(res.data)
        axios({
            url: "https://www.scook.de/blueprint/servlet/api/v1/books?isbn=" + isbn,
            method: "get",
            jar: cookieJar,
            withCredentials: true,
        }).then(async (res) => {
            var bookData = res.data;
            if (bookData.id) {
                console.log("Got Book Data");
                var folder = ("./DownloadTemp/" + bookData.reiheTitel + "/" + bookData.bandTitel + "/").replace(/[^a-zA-Z0-9/ .]/gi, '');
                if (deleteAllOldTempImages && fs.existsSync(folder)) fs.rmSync(folder, {
                    recursive: true,
                });
                console.log("Deleted Temp files");
                fs.mkdir(folder, {
                    recursive: true
                }, () => {
                    console.log("created Folder: " + folder)
                    var coverImage = bookData.coverImgUrls.sort((a, b) => {
                        return parseInt("0x" + b.scaling) - parseInt("0x" + a.scaling)
                    })[0];
                    axios({
                        url: coverImage.url,
                        method: "get",
                        jar: cookieJar,
                        responseType: 'arraybuffer',
                        withCredentials: true,
                    }).then((res) => {
                        //fs.writeFileSync(folder + "cover.png", Buffer.from(res.data, 'binary'))
                        axios({
                            url: "https://www.scook.de/servlet/bv/bookData/" + bookData.id,
                            method: "get",
                            headers: {
                                'accept': "*/*"
                            },
                            jar: cookieJar,
                            withCredentials: true,
                        }).then((res) => {
                            parseString(res.data, async (err, bookDa) => {
                                if (err) {
                                    console.log("Could not get Book data");
                                    //console.log(err);
                                } else {
                                    var pagesAmount = bookDa.book["$"].numStages;
                                    var is = [];
                                    var i = 0;
                                    while (i < pagesAmount) is.push(i++);
                                    Promise.all(is.map(thisI => {
                                        return new Promise((resolve, reject) => {
                                            setTimeout(() => {
                                                axios({
                                                    url: "https://www.scook.de/servlet/bv/documentData/" + bookData.id + "/" + thisI,
                                                    method: "get",
                                                    headers: {
                                                        'accept': "*/*"
                                                    },
                                                    jar: cookieJar,
                                                    withCredentials: true,
                                                }).then((res) => {
                                                    parseString(res.data, (err, pageData) => {
                                                        if (err) {
                                                            console.log("Could not get Page data (" + thisI + ")");
                                                            //console.log(err);
                                                        } else {
                                                            //console.log(pageData.svg.svg.image[0]);
                                                            var firstSortedMipmap = parseSortMipMap(pageData.svg.svg[0].image[0]["$"]["fccs:mipMap"]);
                                                            var secondSortedMipmap = parseSortMipMap(pageData.svg.svg[0].image[1]["$"]["fccs:mipMap"]);
                                                            var firstHref = (firstSortedMipmap[quality] || firstSortedMipmap.slice(-1)[0])[1];
                                                            var secondHref = (secondSortedMipmap[quality] || secondSortedMipmap.slice(-1)[0])[1];
                                                            Promise.all([
                                                                new Promise((resol, rej) => {
                                                                    axios({
                                                                        url: "https://static.cornelsen.de/scbvassets" + firstHref,
                                                                        method: "get",
                                                                        jar: cookieJar,
                                                                        responseType: 'arraybuffer',
                                                                        withCredentials: true,
                                                                    }).then((res) => {
                                                                        var hrefPointArray = firstHref.split(".");
                                                                        var extension = hrefPointArray[hrefPointArray.length - 1];
                                                                        fs.writeFileSync(folder + zeroPad(2 * thisI, 4) + "." + extension, Buffer.from(res.data, 'binary'))
                                                                        console.log("Wrote " + folder + zeroPad(2 * thisI, 4) + "." + extension)
                                                                        resol();
                                                                    }).catch((err) => {
                                                                        console.log("Could not get Image for page " + 2 * thisI);
                                                                        rej("Could not get Image for page " + 2 * thisI);
                                                                    });
                                                                }),
                                                                new Promise((resol, rej) => {
                                                                    axios({
                                                                        url: "https://static.cornelsen.de/scbvassets" + secondHref,
                                                                        method: "get",
                                                                        jar: cookieJar,
                                                                        responseType: 'arraybuffer',
                                                                        withCredentials: true,
                                                                    }).then((res) => {
                                                                        var hrefPointArray = secondHref.split(".");
                                                                        var extension = hrefPointArray[hrefPointArray.length - 1];
                                                                        fs.writeFileSync(folder + zeroPad(2 * thisI + 1, 4) + "." + extension, Buffer.from(res.data, 'binary'))
                                                                        console.log("Wrote " + folder + zeroPad(2 * thisI + 1, 4) + "." + extension)
                                                                        resol();
                                                                    }).catch((err) => {
                                                                        console.log("Could not get Image for page " + (2 * thisI + 1));
                                                                        rej("Could not get Image for page " + (2 * thisI + 1))
                                                                    });
                                                                }),
                                                            ]).then(() => {
                                                                resolve();
                                                            });
                                                        }
                                                    });
                                                }).catch((err) => {
                                                    reject("Could not get Page data (" + thisI + ")");
                                                    console.log("Could not get Page data (" + thisI + ")");
                                                });
                                            }, thisI * 50);
                                        });

                                    })).then(() => {
                                        console.log("Downloaded all images");
                                        var doc = new PDFDoc({
                                            margins: {
                                                top: 0,
                                                bottom: 0,
                                                left: 0,
                                                right: 0
                                            },
                                            autoFirstPage: false,
                                            size: "A4"
                                        });
                                        doc.pipe(fs.createWriteStream((bookData.reiheTitel + "_" + bookData.bandTitel).replace(/[^a-zA-Z0-9/ .]/gi, '') + ".pdf"))
                                        var dir = fs.readdirSync(folder);
                                        dir.sort().forEach((file, idx) => {
                                            doc.addPage();
                                            doc.image(folder + file, {
                                                fit: [595.28, 841.89],
                                                align: 'center',
                                                valign: 'center'
                                            });
                                        });
                                        doc.end();
                                        console.log("Wrote " + (bookData.reiheTitel + "_" + bookData.bandTitel).replace(/[^a-zA-Z0-9/ .]/gi, '') + ".pdf")
                                    });
                                }
                            });
                        }).catch(err => {
                            console.log("Could not get Pages Amount");
                            console.log(err);
                        });
                    }).catch(err => {
                        console.log("Could not get Cover Page");
                        //console.log(err);
                    });
                });
            } else {
                console.log("Could not get Book - A");
            }
        }).catch(err => {
            console.log("Could not get Book - B");
            console.log(err);
        });
    }).catch(err => {
        console.log(err);
    });
}

function parseSortMipMap(mipMap) {
    return mipMap.split("|").map(lvl => lvl.split("=")).sort((a, b) => b[0].substr(1) - a[0].substr(1));
}

function zeroPad(num, places) {
    return String(num).padStart(places, '0');
}

function expandToNearestJSONObject(input, pos) {
    var p0 = pos;
    for (var braces = 0; braces != -1; p0--) {
        if (input[p0] == "}") braces++;
        if (input[p0] == "{") braces--;
    }
    var p1 = pos;
    for (var braces = 0; braces != -1; p1++) {
        if (input[p1] == "{") braces++;
        if (input[p1] == "}") braces--;
    }

    eval("var out =" + input.slice(p0 + 1, p1))
    return out
}
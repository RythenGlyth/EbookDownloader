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
    function get_using_tokens(tokens, environment) {
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
                var folder = ("./out/DownloadTemp/" + name + "/");
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
                doc.pipe(fs.createWriteStream("./out/" + name + ".pdf"))
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
                console.log("Wrote ./out/" + name + ".pdf")



            }).catch(err => {
                console.log(err)
                console.log(`Could not load book - 407`)
            })
        }).catch(err => {
            console.log(err)
            console.log(`Could not load books - 406`)
        })
    }
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
            var p = mainjs.match(/backendUrl\w*:\w*/).index;
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

            if(email === "token") {
                get_using_tokens({token_type: "Bearer", access_token: passwd}, environment);
                return;
            }

            var codeVerifier = randomString(50)
            var sha256hash = crypto.createHash('sha256');
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

                                get_using_tokens(tokens, environment);
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
function randomString(length) {
    let e = "";
    const n = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < length; i++) e += n.charAt(Math.floor(Math.random() * n.length));
    return e
}
module.exports = westermann;

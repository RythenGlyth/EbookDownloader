const readline = require('readline');
const axios = require('axios');
const qs = require('querystring');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const fs = require('fs');
const PDFDoc =require('pdfkit');
const util = require('util')
const prompts  = require('prompts');
const https = require('https')
var spawn = require('child_process').spawn

var HTMLParser = require('node-html-parser');
var parseString = require('xml2js').parseString;
const { stdin, stdout } = require('process');
const { resolve } = require('path');

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
                title: 'Scook',
                value: "scook"
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
        type: (prev, values) => values.publisher == "cornelsen" || values.publisher == "klett" ? null : 'autocomplete',
        name: 'isbn',
        message: "Book",
        choices: (prev, values) => {
            var arr = [
            ];
            if(values.publisher == "scook")
                arr.push({
                    title: 'Deutsch Klasse 9',
                    value: '9783060626410'
                }, {
                    title: 'Englisch Klasse 9',
                    value: '9783060328109'
                })
            arr.push(
                {
                    title: values.publisher == "klett" ? "ID" : 'ISBN',
                    value: 'customisbn'
                })
            return arr;
        }
    },
    {
        type: (prev, values) => prev == "customisbn" && values.publisher != "cornelsen" ? "text" : null,
        name: 'isbn',
        message: (prev, values) => values.publisher == "klett" ? "ID" : 'ISBN'
    },
    {
        type: (prev, values) => (values.publisher == "klett" && values.isbn == "customisbn") ? "text" : null,
        name: 'name',
        message: "Name"
    },
    {
        type: (prev, values) => values.publisher == "cornelsen" || values.publisher == "klett" ? null : 'number',
        name: 'quality',
        message: "quality (0 = best quality)",
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
    inputs.isbn = inputs.isbn || require("./config.json")?.[inputs.publisher]?.isbn;
    inputs.quality = inputs.quality || 0;

    var json = {
        "cornelsen": cornelsen,
        "scook": scook,
        "klett": klett
    }
    json[inputs.publisher](inputs.email, inputs.passwd, inputs.isbn, inputs.name, inputs.quality, inputs.deleteAllOldTempImages);
})
function cornelsen(email, passwd, isbn, name, quality, deleteAllOldTempImages) {
    console.log("Logging in and getting Book list")
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
                    axiosInstance({
                        method: 'get',
                        url: "https://www.cornelsen.de/shop/capiadapter/link/eBibliothek"
                    }).then(res => {
                        //console.log(cookieJar.toJSON().cookies.find(c => c.key == "cornelsen-jwt").value);
                        axiosInstance({
                            method: 'post',
                            url: 'https://mylibrary-api.prod.cornelsen.de/',
                            headers: {
                                "authorization": "Bearer " + cookieJar.toJSON().cookies.find(c => c.key == "cornelsen-jwt").value,
                                "content-type": "application/json",
                                "accept": "*/*",
                                "origin": "https://mein.cornelsen.de",
                            },
                            data: {
                                operationName: "licenses",
                                query: "query licenses {\n  licenses {\n    activeUntil\n    isExpired\n    isNew\n    coverUrl\n    salesProduct {\n      id\n      url\n      heading\n      shortTitle\n      subheading\n      info\n      coverUrl\n      licenseModelId\n      fullVersionId\n      fullVersionUrl\n      __typename\n    }\n    usageProduct {\n      id\n      url\n      heading\n      shortTitle\n      subheading\n      info\n      coverUrl\n      usagePlatformId\n      __typename\n    }\n    __typename\n  }\n}\n",
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
                            }]).then(values => {
                                console.log("Loading possible qualities")
                                name = (values.license?.usageProduct?.heading || values.license?.salesProduct?.heading) + " - " + (values.license?.usageProduct?.subheading || values.license?.salesProduct?.subheading);
                                axiosInstance({
                                    method: 'get',
                                    url: 'https://produkte.cornelsen.de/url/' + values.license?.usageProduct?.usagePlatformId + "/" + values.license?.usageProduct?.id,
                                }).then(res => {
                                    axiosInstance({
                                        method: 'get',
                                        url: `https://ebook.cornelsen.de/uma20/api/v2/pspdfkitjwt/${values.license?.usageProduct?.id}/${values.license?.salesProduct?.fullVersionId}`,
                                        headers: {
                                            "accept": "application/json",
                                            "x-cv-app-identifier": "uma_web_2021.16.3",
                                            "authorization": "Bearer " + cookieJar.toJSON().cookies.find(c => c.key == "cornelsen-jwt").value,
                                        }
                                    }).then(res => {
                                        var pspdfkitjwt = res.data
                                        axiosInstance({
                                            method: 'post',
                                            url: `https://uma20-pspdfkit.prod.aws.cornelsen.de/i/d/${values.license?.salesProduct?.fullVersionId}/auth`,
                                            data: {
                                                "jwt": pspdfkitjwt,
                                                "origin": `https://ebook.cornelsen.de/${values.license?.usageProduct?.id}/willkommen`
                                            },
                                            headers: {
                                                "pspdfkit-platform": "web",
                                                "pspdfkit-version": "protocol=4, client=2021.5.1, client-git=0c1f494f8f",
                                                "referer": "https://ebook.cornelsen.de/",
                                                "origin": "https://ebook.cornelsen.de",
                                            }
                                        }).then(res => {
                                            var pspdfkitauthdata = res.data;
                                            //var qualityScale = quality < pspdfkitauthdata.allowedTileScales.length ? pspdfkitauthdata.allowedTileScales.reverse()[quality] : pspdfkitauthdata.allowedTileScales[0];
                                            axiosInstance({
                                                method: 'get',
                                                url: `https://uma20-pspdfkit.prod.aws.cornelsen.de/i/d/${values.license?.salesProduct?.fullVersionId}/h/${pspdfkitauthdata.layerHandle}/document.json`,
                                                headers: {
                                                    "pspdfkit-platform": "web",
                                                    "pspdfkit-version": "protocol=4, client=2021.5.1, client-git=0c1f494f8f",
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
                                                },{
                                                    type: "text",
                                                    name: "extension",
                                                    message: "Image File Extension",
                                                    initial: "jpg",
                                                },{
                                                    type: "text",
                                                    name: "magickquality",
                                                    message: "Image Magick Quality in % (100% - 100% of size, 95% - 40% of size, 90% - 25% of size, 85% - 15% of size)",
                                                    initial: "90",
                                                },{
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
                                                                    url: `https://uma20-pspdfkit.prod.aws.cornelsen.de/i/d/${values.license?.salesProduct?.fullVersionId}/h/${pspdfkitauthdata.layerHandle}/page-${p.pageIndex}-dimensions-${Math.floor(p.width * values2.quality)}-${Math.floor(p.height * values2.quality)}-tile-0-0-${Math.floor(p.width * values2.quality)}-${Math.floor(p.height * values2.quality)}`,
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
                                                        for(p of pagesData.pages) {
                                                            pi++;
                                                            if(errored) {
                                                                break;
                                                            }
                                                            await new Promise((resolve, reject) => {
                                                                axiosInstance({
                                                                    method: 'get',
                                                                    url: `https://uma20-pspdfkit.prod.aws.cornelsen.de/i/d/${values.license?.salesProduct?.fullVersionId}/h/${pspdfkitauthdata.layerHandle}/page-${p.pageIndex}-dimensions-${Math.floor(p.width * values2.quality)}-${Math.floor(p.height * values2.quality)}-tile-0-0-${Math.floor(p.width * values2.quality)}-${Math.floor(p.height * values2.quality)}`,
                                                                    headers: {
                                                                        "x-pspdfkit-image-token": pspdfkitauthdata.imageToken,
                                                                        "Accept": "image/webp,*/*",
                                                                        "Referer": "https://ebook.cornelsen.de/",
                                                                    },
                                                                    responseType: 'stream',
                                                                }).then(res => {
                                                                    var imageFile = `${tmpFolder}${zeroPad(p.pageIndex, 4)}-${p.pageLabel}.jpg`;
                                                                    magickProcess = spawn("magick", ["-", "-quality", `${values2.magickquality}%`, `${values2.extension}:-`]);

                                                                    magickProcess.stdout.pipe(fs.createWriteStream(imageFile)).on('finish', (s) => {

                                                                        if(values2.selectableText) {
                                                                            axiosInstance({
                                                                                method: 'get',
                                                                                url: `https://uma20-pspdfkit.prod.aws.cornelsen.de/i/d/${values.license?.salesProduct?.fullVersionId}/h/${pspdfkitauthdata.layerHandle}/page-${p.pageIndex}-text`,
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
                                                        if(errored) {
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
                                                            doc.font('./Roboto-Thin.ttf')
                                                            var dir = fs.readdirSync(tmpFolder);
                                                            dir.sort().forEach((file, idx) => {
                                                                doc.addPage();
                                                                doc.image(tmpFolder + file, {
                                                                    fit: [pagesData.pages[0].width, pagesData.pages[0].height],
                                                                    align: 'center',
                                                                    valign: 'center'
                                                                });
                                                                if(values2.selectableText) {
                                                                    pagesText[/*idx*/ parseInt(file.split("-")[0])].forEach(line => {
                                                                        if(line.contents.length > 0) {
                                                                            doc.save();
                                                                            //doc.rect(line.left, line.top, line.width, line.height).fillOpacity(0.5).fill("#1e1e1e")

                                                                            doc.translate(line.left, line.top);
                                                                            if(line.height > line.width && line.height / line.contents.length < line.width) {
                                                                                doc.rotate(90).scale(line.height/doc.widthOfString(line.contents, {
                                                                                    lineBreak: false,
                                                                                }), line.width/doc.heightOfString(line.contents, { 
                                                                                    lineBreak: false,
                                                                                }) ).translate(0, -(doc.heightOfString(line.contents, { 
                                                                                    lineBreak: false,
                                                                                }) / 2))
                                                                            } else {
                                                                                try {
                                                                                    doc.scale(line.width/doc.widthOfString(line.contents, {
                                                                                        lineBreak: false,
                                                                                    }), line.height/doc.heightOfString(line.contents, { 
                                                                                        lineBreak: false,
                                                                                    })).translate(0, (doc.heightOfString(line.contents, {
                                                                                        lineBreak: false,
                                                                                    }) / 2));
                                                                                } catch(err) {
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
                                                console.log("Could not load book pages - 759")
                                                console.log(err)
                                            });
                                        }).catch(err => {
                                            console.log("Could not authenticate PSPDFKIT - 758")
                                            console.log(err)
                                        });
                                    }).catch(err => {
                                        console.log("Could not authenticate PSPDFKIT - 757")
                                        console.log(err)
                                    });
                                }).catch(err => {
                                    console.log("Could not load book - 756")
                                    console.log(err)
                                });
                            });
                        }).catch(err => {
                            console.log("Could not get library - 755")
                            console.log(err)
                        });
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
async function klett(email, passwd, isbn, name, quality, deleteAllOldTempImages) {
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
                for(let l of res.data?.items) {
                    choices.push(await new Promise((resolve, rej) => {
                        axios({
                            url: l?.["_links"]?.["produkt"]?.["href"],
                            jar: cookieJar,
                            withCredentials: true,
                        }).then(res => {
                            resolve({
                                title: res.data?.titel + " - " + res.data?.untertitel,
                                value: {dienst_id: l.dienst_id, title: res.data?.titel + " - " + res.data?.untertitel}
                            })
                        }).catch(err => {
                            console.log(err);
                            console.log("Error fetching book info")
                        })
                    }))
                }
                prompts([{
                    type: (prev, values) => values.publisher == "cornelsen" ? null : 'autocomplete',
                    name: 'license',
                    message: "Book",
                    choices
                }]).then(values => {

                    axios({
                        url: "https://bridge.klett.de/" + values.license.dienst_id + "/",
                        method: "get",
                        jar: cookieJar,
                        withCredentials: true,
                    }).then(async (res) => {
                        //fs.writeFileSync("./sas", res.data);
                        //Promise.all(HTMLParser.parse(res.data).querySelector(".viewport").querySelector(".zoomable").querySelector(".pages").childNodes.map(pageNode => {
                        var mainpagehtml = HTMLParser.parse(res.data);
                        var settingsJSON = JSON.parse(mainpagehtml.querySelector("#settings-json").innerText);
                        //console.log(settingsJSON);

                        var size;
                        /** @type {{[page: number]: {height: number, width: number, x: number, y: number, url: string}[]}} */
                        var hyperlinks = {};
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

                        if(settingsJSON.buildYear == "2021") {

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
                            for(let pi in titles) {
                                if(pi > 20) break;
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
                                            console.log(`\x1b[1A\x1b[2K\x1b[1GDownloaded ${parseInt(pi)+1}/${titles.length} pages`)
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

                            if(bothPrompts.selectableText || bothPrompts.hyperlinks) {
                                console.log("Downloading pages text");

                                dataJson = await new Promise((resolve, reject) => {
                                    axios({
                                        url: "https://bridge.klett.de/" + values.license.dienst_id + "/data.json",
                                        method: "get",
                                        jar: cookieJar,
                                        withCredentials: true,
                                    }).then(async (res) => {
                                        resolve(res.data);
                                    }).catch(err => {
                                        console.log(err);
                                        console.log("Error downloading pages text")
                                        resolve();
                                    });
                                });
                            }

                            if(bothPrompts.hyperlinks) {
                                dataJson.pages.forEach((page, idx) => {
                                    if(page.layers?.[0]?.areas?.length) {
                                        hyperlinks[idx] = page.layers?.[0]?.areas;
                                    }
                                });
                            }

                            size = [ values2.quality.width / values2.quality.scale, values2.quality.height / values2.quality.scale ];

                            //console.log(values2)

                        } else {
                            console.log("starting old downloader")

                            var values2 = await prompts([{
                                type: 'select',
                                name: 'quality',
                                message: "quality",
                                choices: [4,2,1].map(q => {
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
                            for(var pi in pagesNode) {
                                if(pi > 10) break;
                                var pageNode = pagesNode[pi];
                                await new Promise((resolve, reject) => {
                                    if(pageNode.querySelector(".content")) {
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
                                                console.log(`\x1b[1A\x1b[2K\x1b[1GDownloaded ${parseInt(pi)+1}/${pagesNode.length} pages`)
                                                resolve();
                                            })
                                        }).catch(err => {
                                            console.log(err);
                                            console.log("error downloading" + zeroPad(pageNode.getAttribute("data-pos"), 4) + "-" + pageNode.getAttribute("data-title"))
                                        })
                                    } else {
                                        resolve();
                                    }
                                });
                            }
                            console.log("Downloaded all images");
                            size = [ 768, 1024 ];
                        }

                        await new Promise((resolve, reject) => {
                            setTimeout(() => { // wait for pipes to finish (needs better handling)
                                resolve();
                            }, 5000);
                        });
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
                        console.log(bothPrompts);
                        doc.pipe(fs.createWriteStream(name + ".pdf"))
                        doc.font('./Roboto-Thin.ttf')
                        var dir = fs.readdirSync(folder);
                        dir.sort().forEach((file, idx) => {
                            doc.addPage();
                            doc.image(folder + file, {
                                fit: size,
                                align: 'center',
                                valign: 'center'
                            });
                        });
                        dir.sort().forEach((file, idx) => {
                            doc.switchToPage(idx);
                            if(bothPrompts.hyperlinks) {
                                //console.log(hyperlinks);
                                hyperlinks[idx]?.forEach(area => {
                                    var x = area.x * size[0];
                                    var y = area.y * size[1];
                                    var w = area.width * size[0];
                                    var h = area.height * size[1];
                                    if(area.url.startsWith("?page=") && (toPage = parseInt(area.url.split("=")[1]) -1) && toPage < doc.bufferedPageRange().start + doc.bufferedPageRange().count) {
                                        doc.link(x, y, w, h, toPage);
                                    } else {
                                        doc.link(x, y, w, h, area.url);
                                    }
                                });
                            }
                        });
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
function scook(email, passwd, isbn, name, quality, deleteAllOldTempImages) {
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
            if(bookData.id) {
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
                                if(err) {
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
                                                        if(err) {
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
                                                                        fs.writeFileSync(folder + zeroPad(2*thisI, 4) + "." + extension, Buffer.from(res.data, 'binary'))
                                                                        console.log("Wrote " + folder + zeroPad(2*thisI, 4) + "." + extension)
                                                                        resol();
                                                                    }).catch((err) => {
                                                                        console.log("Could not get Image for page " + 2*thisI);
                                                                        rej("Could not get Image for page " + 2*thisI);
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
                                                                        fs.writeFileSync(folder + zeroPad(2*thisI+1, 4) + "." + extension, Buffer.from(res.data, 'binary'))
                                                                        console.log("Wrote " + folder + zeroPad(2*thisI+1, 4) + "." + extension)
                                                                        resol();
                                                                    }).catch((err) => {
                                                                        console.log("Could not get Image for page " + (2*thisI + 1));
                                                                        rej("Could not get Image for page " + (2*thisI + 1))
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



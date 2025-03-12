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
const { zeroPad } = require('../utils')

axiosCookieJarSupport(axios);

async function klett(email, passwd, deleteAllOldTempImages) {
    const cookieJar = new tough.CookieJar();
    function getByBridgeURL(url, title) {
        if(!url.endsWith("/"))
            url += "/";


        axios({
            url: url,
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


                var name = title.replace(/[^a-zA-Z0-9 \(\)_\-,\.]/gi, '') + "_" + `${values2.quality.width}x${values2.quality.height}`;
                var folder = ("./out/DownloadTemp/" + name + "/");
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
                            url: url + values2.quality.path.replace("${page}", pi),
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
                            url: url + "data.json",
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

                var name = title.replace(/[^a-zA-Z0-9 \(\)_\-,\.]/gi, '') + "_" + `${768 * values2.quality}x${1024 * values2.quality}`;
                var folder = ("./out/DownloadTemp/" + name + "/");
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
                                url: url + img,
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
                            url: url + selectableText[st].wordPositionSvg,
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
                                    //process.exit(1);
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
            console.log("Wrote ./out/" + name + ".pdf")
        }).catch(err => {
            console.log(err);
            console.log("Error fetching pages")
        });
    }
    if(email.startsWith("http")) {
        email = email.split("?")[0]
        cookieJar.setCookie(tough.Cookie.parse("SESSION=" + passwd + "; path=/; domain=bridge.klett.de"), "https://bridge.klett.de");
        getByBridgeURL(email, "Klett TokenDL " + email.split("/").slice(-2)[0]);
        return;
    }
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
                    getByBridgeURL("https://bridge.klett.de/" + values.license.dienst_id + "/", values.license.title)
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
module.exports = klett;

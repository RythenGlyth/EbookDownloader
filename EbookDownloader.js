const readline = require('readline');
const axios = require('axios');
const qs = require('querystring');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const fs = require('fs');
const PDFDoc =require('pdfkit');
const util = require('util')
const prompts  = require('prompts');

var HTMLParser = require('node-html-parser');
var parseString = require('xml2js').parseString;
const { stdin, stdout } = require('process');

axiosCookieJarSupport(axios);

prompts([
    {
        type: 'select',
        name: 'publisher',
        message: "Publisher",
        choices: [
            {
                title: 'Klett',
                value: "klett"
            },
            {
                title: 'Cornelsen',
                value: "cornelsen"
            }
        ]
    },
    {
        type: 'text',
        name: 'email',
        message: "Email"
    },
    {
        type: 'password',
        name: 'passwd',
        message: "Pasword",
    },
    {
        type: 'autocomplete',
        name: 'isbn',
        message: "Book",
        choices: (prev, values) => {
            var arr = [
            ];
            if(values.publisher == "cornelsen")
                arr.push({
                    title: 'Deutsch Klasse 9',
                    value: '9783060626410'
                }, {
                    title: 'Englisch Klasse 9',
                    value: '9783060328109'
                })
            if(values.publisher == "klett")
                arr.push({
                    title: "Geschichte und Geschehen 9",
                    value: "EBK-SPKXAVF6EM"
                }, {
                    title: "Lambacher Schweizer Mathematik 9",
                    value: "EBK-4TVSHFYQAM"
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
        type: prev => prev == "customisbn" ? "text" : null,
        name: 'isbn',
        message: (prev, values) => values.publisher == "klett" ? "ID" : 'ISBN'
    },
    {
        type: (prev, values) => (values.publisher == "klett" && values.isbn == "customisbn") ? "text" : null,
        name: 'name',
        message: "Name"
    },
    {
        type: 'number',
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
    inputs.email = inputs.email || require("./config.json").email;
    inputs.passwd = inputs.passwd || require("./config.json").passwd;
    inputs.isbn = inputs.isbn || require("./config.json").isbn;
    inputs.quality = inputs.quality || 0;

    if(!inputs.name) {
        switch(inputs.isbn) {
            case "EBK-SPKXAVF6EM":
                inputs.name = "Geschichte und Geschehen 9";
                break;
            case "EBK-4TVSHFYQAM":
                inputs.name = "Lambacher Schweizer Mathematik 9";
                break;
        }
    }


    var json = {
        "cornelsen": cornelsen,
        "klett": klett
    }
    json[inputs.publisher](inputs.email, inputs.passwd, inputs.isbn, inputs.name, inputs.quality, inputs.deleteAllOldTempImages);
})
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
            var folder = ("./DownloadTemp/" + name + "/").replace(/[^a-zA-Z0-9/ .]/gi, '');
            if (deleteAllOldTempImages && fs.existsSync(folder)) fs.rmSync(folder, {
                recursive: true,
            });
            console.log("Deleted Temp files");
            fs.mkdir(folder, {
                recursive: true
            }, () => {
                console.log("created Folder: " + folder)
                axios({
                    url: "https://bridge.klett.de/" + isbn + "/",
                    method: "get",
                    jar: cookieJar,
                    withCredentials: true,
                }).then((res) => {
                    Promise.all(HTMLParser.parse(res.data).querySelector(".viewport").querySelector(".zoomable").querySelector(".pages").childNodes.map(pageNode => {
                        return new Promise((resolve, reject) => {
                            setTimeout(() => {
                                //console.log(zeroPad(pageNode.getAttribute("data-pos"), 4));
                                if(pageNode.querySelector(".content")) {
                                    var imgs = pageNode.querySelector(".content").querySelector(".image-layers").childNodes.map(nd => nd.childNodes[0].getAttribute("style").split("'")[1]).reverse();
                                    var img = (imgs[quality] || imgs.slice(-1)[0]);
                                    axios({
                                        url: "https://bridge.klett.de/" + isbn + "/" + img,
                                        method: "get",
                                        jar: cookieJar,
                                        withCredentials: true,
                                        responseType: 'arraybuffer',
                                        withCredentials: true,
                                    }).then((res) => {
                                        var extension = img.split(".").slice(-1);
                                        fs.writeFileSync(folder + zeroPad(pageNode.getAttribute("data-pos"), 4) + "." + extension, Buffer.from(res.data, 'binary'))
                                        console.log("Wrote " + folder + zeroPad(pageNode.getAttribute("data-pos"), 4) + "." + extension)
                                        resolve();
                                    }).catch(err => {
                                        console.log("error downloading" + zeroPad(pageNode.getAttribute("data-pos"), 4))
                                    })
                                } else {
                                    console.log("no image for " + zeroPad(pageNode.getAttribute("data-pos"), 4))
                                    resolve();
                                }
                            }, 50);
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
                        doc.pipe(fs.createWriteStream(name.replace(/[^a-zA-Z0-9/ .]/gi, '') + ".pdf"))
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
                        console.log("Wrote " + name.replace(/[^a-zA-Z0-9/ .]/gi, '') + ".pdf")
                    });
                }).catch(err => {
                    console.log(err);
                    console.log("Error fetching pages Amount")
                });
            });
        }).catch(err => {
            console.log("Error while login")
        });
    }).catch(err => {
        console.log(err);
        console.log("Error fetching loginForm")
    });
}
function cornelsen(email, passwd, isbn, name, quality, deleteAllOldTempImages) {
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

/*

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.question("Email: ", email => {
    email = email || require("./config.json").email;
    rl.question("Password: ", passwd => {
        passwd = passwd || require("./config.json").passwd;
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
            rl.question("ISBN: ", isbn => {
                isbn = isbn || require("./config.json").isbn;
                axios({
                    url: "https://www.scook.de/blueprint/servlet/api/v1/books?isbn=" + isbn,
                    method: "get",
                    jar: cookieJar,
                    withCredentials: true,
                }).then((res) => {
                    var bookData = res.data;
                    if(bookData.id) {
                        console.log("Got Book Data");
                        var folder = ("./DownloadTemp/" + bookData.reiheTitel + "/" + bookData.bandTitel + "/").replace(/[^a-zA-Z0-9/ .]/gi, '');
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
                                        'accept': "* /*"
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
                                                                'accept': "* /*"
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
                                                                    var firstHref = parseSortMipMap(pageData.svg.svg[0].image[0]["$"]["fccs:mipMap"])[0][1];
                                                                    var secondHref = parseSortMipMap(pageData.svg.svg[0].image[1]["$"]["fccs:mipMap"])[0][1];
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
                    //console.log(err);
                });
            })
        }).catch(err => {
            console.log(err);
        });
    });
});*/

function parseSortMipMap(mipMap) {
    return mipMap.split("|").map(lvl => lvl.split("=")).sort((a, b) => b[0].substr(1) - a[0].substr(1));
}

function zeroPad(num, places) {
    return String(num).padStart(places, '0');
}



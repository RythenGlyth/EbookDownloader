const readline = require('readline');
const axios = require('axios');
const qs = require('querystring');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const fs = require('fs');
const PDFDoc =require('pdfkit');
const util = require('util')
const prompts  = require('prompts');

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
                {
                    title: 'ISBN',
                    value: 'customisbn'
                }
            ];
            if(values.publisher == "cornelsen")
                arr.push({
                    title: 'Deutsch Klasse 9',
                    value: '9783060626410'
                }, {
                    title: 'Englisch Klasse 9',
                    value: '9783060328109'
                })
            return arr;
        }
    },
    {
        type: prev => prev == "customisbn" ? "text" : null,
        name: 'isbn',
        message: "ISBN"
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


    var json = {
        "cornelsen": cornelsen,
        "klett": klett
    }
    json[inputs.publisher](inputs.email, inputs.passwd, inputs.isbn, inputs.quality, inputs.deleteAllOldTempImages);
})
async function klett(email, passwd, isbn, quality, deleteAllOldTempImages) {
    const cookieJar = new tough.CookieJar();
    axios({
        url: "https://www.klett.de/login",
        method: "get",
        jar: cookieJar,
        withCredentials: true,
    }).then(res => {
        console.log(cookieJar);
    }).catch(err => {
        resolve();
    });
}
function cornelsen(email, passwd, isbn, quality, deleteAllOldTempImages) {
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



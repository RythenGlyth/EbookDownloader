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

axiosCookieJarSupport(axios);

function book2look(deleteAllOldTempImages) {
    prompts([
        {
            type: 'text',
            name: 'book2lookID',
            message: 'Book2Look ID (from URL: https://book2look.com/book/<ID> )',
        }
    ]).then(async (inputs) => {
        var book2lookID = inputs.book2lookID;
        axios("https://www.book2look.com/html5/v5/config.xml?t=" + Date.now()).then(async (res) => {
            parseString(res.data, async (err, parsedData) => {
                if(err) {
                    console.log(err)
                    console.log("book2look config loading failed - e401")
                    return;
                }
                const piv = Array.isArray(parsedData.config.piv) ? parsedData.config.piv[0] : parsedData.config.piv;
                const ps = Array.isArray(parsedData.config.ps) ? parsedData.config.ps[0] : parsedData.config.ps;
                axios(`https://www.book2look.com/BookContent/FlipBooks/${book2lookID}_assets/xml/bookData.xml?dt=${Date.now()}`).then(async (res) => {
                    parseString(res.data, async (err, parsedData) => {
                        if(err) {
                            console.log(err)
                            console.log("book2look book loading failed - e403")
                            return;
                        }
                        const bookData = parsedData.bookData;
                        const bookInfo = Array.isArray(bookData.bookInfo) ? bookData.bookInfo[0] : bookData.bookInfo;
                        const title = Array.isArray(bookInfo.title) ? bookInfo.title[0] : bookInfo.title;
                        const subtitle = Array.isArray(bookInfo.subtitle) ? bookInfo.subtitle[0] : bookInfo.subtitle;
                        //console.log(bookData.bookInfo[0].title + bookData.bookInfo[0].subtitle)
                        axios(`https://www.book2look.com/Report/GETBOOKID-New.aspx?id=${book2lookID}&refererpath=book2look.com&dct=true&objtype=PDFD&bibletformat=pdf`).then(async (res) => {
                            axios(`https://www.book2look.com/${res.data}`).then(async (res) => {
                                parseString(res.data, async (err, parsedData) => {
                                    if(err) {
                                        console.log(err)
                                        console.log("book2look book loading failed - e406")
                                        return;
                                    }
                                    const bookRunTimeData = parsedData.bookRunTimeData;
                                    const euid = Array.isArray(bookRunTimeData.euid) ? bookRunTimeData.euid[0] : bookRunTimeData.euid;
                                    //8 x number
                                    const randomStr = Array(8).fill(0).map(() => Math.floor(Math.random() * 10)).join("");
                                    axios(`https://bibletapi.book2look.com/api/Biblet/showbox?&AId=${euid}${String.fromCharCode(97 + Math.floor(Math.random() * 26))}${randomStr}`).then(async (res) => {
                                        const encryptedKey = res.data;
                                        crypto.pbkdf2(randomStr, ps, 1000, 16, 'sha1', (err, key) => {
                                            if(err) {
                                                console.log(err)
                                                console.log("book2look decryption failed - e408")
                                                return;
                                            }
                                            const iv = Buffer.from(piv, 'hex');
                                            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
                                            let decrypted = decipher.update(encryptedKey, 'base64', 'utf8');
                                            decrypted += decipher.final('utf8');
                                            const password = decrypted;
                                            console.log("Key: " + password)
                                            console.log("Downloading PDF...")
                                            axios(`https://www.book2look.com/BookContent/FlipBooks/${book2lookID}_assets/pdf/${book2lookID}.pdf`, {
                                                responseType: 'arraybuffer'
                                            }).then(async (res) => {

                                                /** @type {typeof import("mupdf/dist/mupdf")} mupdf */
                                                const mupdf = await import("mupdf")
                                                /** @type {typeof import("mupdf/dist/mupdf").PDFDocument} doc */
                                                const doc = mupdf.Document.openDocument(res.data, ".pdf")
                                                console.log(doc.authenticatePassword(password))
                                                const filename = `${title} - ${subtitle}.pdf`.replace(/[^a-za-z0-9 \(\)_\-,\.]/gi, '');
                                                fs.writeFileSync(`./out/${filename}`, doc.saveToBuffer("decrypt").asUint8Array())
                                                console.log("Downloaded PDF")
                                            }).catch(err => {
                                                console.log(err)
                                                console.log("book2look pdf download failed - e409")
                                            })
                                        })
                                    }).catch(err => {
                                        console.log(err)
                                        console.log("book2look book loading failed - e407")
                                    })
                                })
                            }).catch(err => {
                                console.log(err)
                                console.log("book2look book loading failed - e405")
                            })
                        }).catch(err => {
                            console.log(err)
                            console.log("book2look book loading failed - e404")
                        })
                    })
                }).catch(err => {
                    console.log(err)
                    console.log("book2look book loading failed - e402")
                })
            })
        }).catch(err => {
            console.log(err)
            console.log("book2look config loading failed - e400")
        })
    })

}

module.exports = book2look;
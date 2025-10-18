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


const cornelsen = require('./downloader/cornelsen')
const kiosquemag = require('./downloader/kiosquemag')
const book2look = require('./downloader/book2look')
const allango = require('./downloader/allango')
const clicknstudy = require('./downloader/clicknstudy')
const clicknteach = require('./downloader/clicknteach')
const klett = require('./downloader/klett')
const westermann = require('./downloader/westermann')
const scook = require('./downloader/scook')
const cornelsench = require('./downloader/cornelsench')

prompts([
    {
        type: 'select',
        name: 'publisher',
        message: "Publisher / Website",
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
                title: 'Klett allango',
                value: "allango"
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
            },
            {
                title: 'C.C.BUCHNER - click & teach',
                value: "clicknteach"
            },
            {
                title: 'book2look.com',
                value: "book2look"
            },
            {
                title: 'Cornelsen.ch',
                value: "cornelsench"
            },
            {
                title: "kiosquemag.com",
                value: "kiosquemag"
            }
        ]
    },
    {
        type: (prev, values) => values.publisher == "book2look" ? null : 'text',
        name: 'email',
        message: (prev, values) => values.publisher == "cornelsen" ? "Name (Empty to read from config.json)" : 'Email (Empty to read from config.json)'
    },
    {
        type: (prev, values) => values.publisher == 'book2look' ? null : 'password',
        name: 'passwd',
        message: "Password (Empty to read from config.json)",
    },
    {
        type: 'confirm',
        name: 'deleteAllOldTempImages',
        message: "Overwrite old temp files",
        initial: true
    }
]).then(inputs => {
    try {
        const config = JSON.parse(fs.readFileSync("./config.json", "utf-8") ?? "{}")
        inputs.email = inputs.email || config?.[inputs.publisher]?.email;
        inputs.passwd = inputs.passwd || config?.[inputs.publisher]?.passwd;
    } catch(ex) {}

    switch (inputs.publisher) {
        case "cornelsen":
            cornelsen(inputs.email, inputs.passwd, inputs.deleteAllOldTempImages, false)
            break;
        case "klett":
            klett(inputs.email, inputs.passwd, inputs.deleteAllOldTempImages)
            break;
        case "allango":
            allango(inputs.email, inputs.passwd, inputs.deleteAllOldTempImages)
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
        case "clicknteach":
            clicknteach(inputs.email, inputs.passwd, inputs.deleteAllOldTempImages)
            break;
        case "kiosquemag":
            kiosquemag(inputs.email, inputs.passwd, inputs.deleteAllOldTempImages)
            break;
        case "cornelsench":
            cornelsench(inputs.email, inputs.passwd, inputs.deleteAllOldTempImages, true)
            break;
        case 'book2look':
            book2look(inputs.deleteAllOldTempImages)
    }
})

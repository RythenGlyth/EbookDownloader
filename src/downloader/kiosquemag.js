
const axios = require('axios').default;
const axiosCookieJarSupport = require('axios-cookiejar-support').wrapper;
const tough = require('tough-cookie');
const HTMLParser = require('node-html-parser');
const prompts = require('prompts')
const { expandToNearestJSONObject } = require('../utils')
const pdflib = require('pdf-lib')
const fs = require('fs')

axiosCookieJarSupport(axios);

const TILE_SIZE = 512;
const IMMANENS_READER_SEARCH = "immanens.pv5.ReaderPress({"


async function kiosquemag(email, passwd, deleteAllOldTempImages) {
    const cookieJar = new tough.CookieJar();
    const axiosInstance = axios.create({
        jar: cookieJar,
        withCredentials: true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        }
    });
    const loginPage = await axiosInstance({
        method: 'get',
        url: "https://www.kiosquemag.com/login"
    }).catch(err => {
        console.log(err)
        console.log("kiosquemag login page loading failed - e700")
    })

    let root = HTMLParser.parse(loginPage.data);
    let form = root.querySelector(".login-form form");
    let csrf = form.querySelector("#_csrf_shop_security_token").getAttribute("value");
    const loginRes = await axiosInstance({
        method: 'POST',
        url: "https://www.kiosquemag.com" + (form.getAttribute("action") ?? "/login-check"),
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest"
        },
        data: JSON.stringify({
            _csrf_shop_security_token: csrf,
            _username: email,
            _password: passwd
        }),
        validateStatus: (status) => {
            return (status >= 200 && status < 300) || status === 401;
        }
    }).catch(err => {
        console.log(err)
        console.log("kiosquemag login failed - e701")
    })

    if (!loginRes.data?.success) {
        console.log("Login failed:", loginRes.data?.message)
        return;
    }

    console.log("Login successful")

    const booksPage = await axiosInstance({
        method: 'get',
        url: "https://www.kiosquemag.com/account/mes-magazines-numeriques"
    }).catch(err => {
        console.log(err)
        console.log("kiosquemag books page loading failed - e702")
    })

    root = HTMLParser.parse(booksPage.data);
    
    const chosenMagUrl = (await prompts({
        type: 'select',
        name: 'magazine',
        message: 'Choose a magazine',
        choices: root.querySelectorAll("a.user_mag_block_item_link").map(book => ({
            title: book.querySelector(".user_mag_block_item_content").innerText.trim(),
            value: book.getAttribute("href")
        }))
    })).magazine

    const magPage = await axiosInstance({
        method: 'get',
        url: "https://www.kiosquemag.com" + chosenMagUrl
    }).catch(err => {
        console.log(err)
        console.log("kiosquemag magazine page loading failed - e703")
    })

    root = HTMLParser.parse(magPage.data);
    
    const chosenIssueUrl = (await prompts({
        type: 'select',
        name: 'issue',
        message: 'Choose the issue',
        choices: root.querySelectorAll(".user_mag_block_item.mag-item-container-mois").map(book => ({
            title: book.querySelector(".detail").innerText.trim(),
            value: book.querySelector("a.user_mag_block_item_link").getAttribute("href")
        }))
    })).issue

    console.log("Downloading magazine page...")

    const issuePage = await axiosInstance({
        method: 'get',
        url: "https://www.kiosquemag.com" + chosenIssueUrl
    }).catch(err => {
        console.log(err)
        console.log("kiosquemag issue page loading failed - e704")
    })

    /**
     * @type {{el: string, pv5api: string, token: string, lang: string, publicationId: number, documentId: number, page: number, themeApi: string, homeUrl: string}}
     */
    const reader_data = expandToNearestJSONObject(issuePage.data, issuePage.data.indexOf(IMMANENS_READER_SEARCH) + IMMANENS_READER_SEARCH.length)

    /**
     * @type {{id: number, isDouble: boolean, nbPages: number, toc: number, publicationId: number, publicationTitle: string, published: string, title: string, isXml: boolean, publicationLogisticId: string, documentLogisticId: string, logisticId: string, reversed: boolean, hasToc: boolean, hasLayout: boolean, lang: string, pageList: string, mtime: number, hasVecto: boolean, serverPdfMaxPages: number}}
     */
    const documentData = (await axiosInstance({
        method: 'get',
        url: `${reader_data.pv5api}/document/${reader_data.publicationId}/${reader_data.documentId}`,
        headers: {
            "X-Access-Token": reader_data.token
        }
    }).catch(err => {
        console.log(err)
        console.log("kiosquemag document data loading failed - e705")
    })).data

    const filename = `${documentData.publicationTitle} - ${documentData.title}`

    var doc = await pdflib.PDFDocument.create();

    console.log(`Downloaded 0/${documentData.nbPages} pages`)
    for(let i = 1; i <= documentData.nbPages; ) {
        const pagedata = (await axiosInstance({
            method: 'get',
            url: `${reader_data.pv5api}/document/${reader_data.publicationId}/${reader_data.documentId}/page/${i}?mt=${documentData.mtime}`,
            headers: {
                "X-Access-Token": reader_data.token
            }
        }).catch(err => {
            console.log(err)
            console.log("kiosquemag page data loading failed - e706")
        })).data

        let page = doc.addPage([pagedata.width, pagedata.height]);

        for(let e = 0; e * TILE_SIZE < pagedata.width; e++) {
            for(let f = 0; f * TILE_SIZE < pagedata.height; f++) {
                const tile = (await axiosInstance({
                    method: 'get',
                    url: `${reader_data.pv5api}/document/${reader_data.publicationId}/${reader_data.documentId}/page/${i}/tile/${e}/${f}/0`,
                    params: {
                        token: reader_data.token,
                        mt: documentData.mtime
                    },
                    responseType: 'arraybuffer'
                }).catch(err => {
                    console.log(err)
                    console.log("kiosquemag tile loading failed - e707")
                }))
                
                const image = tile.headers['content-type'] == "image/jpeg" ? await doc.embedJpg(tile.data) : await doc.embedPng(tile.data);
                page.drawImage(image, {
                    x: e * TILE_SIZE,
                    y: pagedata.height - f * TILE_SIZE - image.height,
                    width: image.width,
                    height: image.height
                });
            }
        }

        i+=pagedata.number?.length;
        console.log(`\x1b[1A\x1b[2K\x1b[1GDownloaded ${i-1}/${documentData.nbPages} pages`)
    }

    fs.writeFileSync(`./out/${filename}.pdf`, await doc.save());

    console.log("Wrote PDF to ./out/" + filename + ".pdf")
}

module.exports = kiosquemag;
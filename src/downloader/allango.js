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


function allango(email, passwd, deleteAllOldTempImages) {
    const cookieJar = new tough.CookieJar();
    const axiosInstance = axios.create({
        jar: cookieJar,
        withCredentials: true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        }
    });
    axiosInstance({
        method: 'get',
        url: "https://www.allango.net/"
    }).then(res => {
        axiosInstance({
            method: 'get',
            url: 'https://www.allango.net/keycloak-eks.json'
        }).then(keycloakres => {
            let auth_url = (keycloakres.data["auth-server-url"].endsWith("/") ? keycloakres.data["auth-server-url"] : keycloakres.data["auth-server-url"] + "/") +  'realms/' + encodeURIComponent(keycloakres.data["realm"]);
            axiosInstance({
                method: 'get',
                url: auth_url + '/protocol/openid-connect/auth',
                params: {
                    client_id: keycloakres.data["resource"],
                    redirect_uri: 'https://www.allango.net/',
                    scope: "openid",
                    nonce: crypto.randomUUID(),
                    state: crypto.randomUUID(),
                    response_mode: 'fragment',
                    response_type: "code",
                    ui_locales: 'en',
                },
                headers: {
                    'Referer': 'https://www.allango.net/',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                }
            }).then(loginpage => {
                let loginpageRoot = HTMLParser.parse(loginpage.data);
                axiosInstance({
                    method: 'post',
                    url: loginpageRoot.querySelector('form').getAttribute('action'),
                    data: qs.stringify({
                        username: email,
                        password: passwd,
                        credentialId: '',
                    }),
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    maxRedirects: 0,
                    validateStatus: status => status == 302 || status == 200
                }).then(res => {
                    if (!(res.status == 302 && res.headers.location?.startsWith('https://www.allango.net/'))) {
                        console.log("allango login failed - e603")
                        let loginpageRoot = HTMLParser.parse(res.data);
                        let el;
                        if(el = loginpageRoot.querySelector("#input-error")) {
                            console.log(el.textContent.trim())
                        }
                        return;
                    }
                    const authRedirectUri = new URL(res.headers.location);
                    const authRedirectUriHashDict = Object.fromEntries(authRedirectUri.hash.slice(1).split("&").map(i => i.split("=")));    
                    console.log("logged in")
                    axiosInstance({
                        method: "post",
                        url: auth_url + '/protocol/openid-connect/token',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        data: qs.stringify({
                            code: authRedirectUriHashDict.code,
                            grant_type: 'authorization_code',
                            client_id: keycloakres.data["resource"],
                            redirect_uri: 'https://www.allango.net/',
                        })
                    }).then(async res => {
                        const token = res.data;
                        console.log("loading library")
                        const showall = (await prompts([{
                            type: "toggle",
                            name: "showall",
                            message: "Show all books (including books not owned)",
                            initial: false
                        }])).showall
                        axiosInstance({
                            method: 'get',
                            url: `https://www.allango.net/api/search/${showall ? 'book' : 'mybook'}?searchString=&page=1&pagesize=100000`,
                            headers: {
                                'Authorization': `${token.token_type} ${token.access_token}`
                            }
                        }).then(async res => {
                            let products = res.data?.resultPage?.content
                            if(!products || products.length == 0) {
                                console.log("no books found")
                                return;
                            }
                            let startOfDay = new Date().setHours(0,0,0,0) / 1000
                            let endOfDay = new Date().setHours(23,59,59,999) / 1000
                            const book = (await prompts([{
                                type: "autocomplete",
                                name: "book",
                                message: "Select a book",
                                warn: "Disabled options don't have downloadable content",
                                choices: products.filter(book => book.npNumbers).map(book => {
                                    return {
                                        title: `${book.title}: ${book.bookDescription} (${book.isbn}) ${!book.license ? "(no license)" : !book.license.some(l => l.validFrom < endOfDay) ? "(not activated)" : !book.license.some(l => l.validTo > startOfDay) ? "(expired)" : ""}`,
                                        //disabled: !book.license.some(l => l.validTo > startOfDay && l.validFrom < endOfDay),
                                        //disabled: !book.npNumbers,
                                        value: book
                                    }
                                }).sort((a, b) => {
                                    return !!b.value.npNumbers - !!a.value.npNumbers
                                    //return b.value.license?.some(l => l.validTo > startOfDay &&  l.validFrom < endOfDay) - a.value.license?.some(l => l.validTo > startOfDay &&  l.validFrom < endOfDay)
                                })
                            }])).book
                            axiosInstance({
                                method: 'get',
                                url: 'https://www.allango.net/api/product/' + book.id,
                                headers: {
                                    'Authorization': `${token.token_type} ${token.access_token}`
                                }
                            }).then(async res => {
                                const edition = (await prompts([{
                                    type: "autocomplete",
                                    name: "edition",
                                    message: "Select a edition",
                                    warn: "Disabled options don't have downloadable content",
                                    choices: res.data.editions.filter(edition => edition.npNumber).map(edition => {
                                        return {
                                            title: `${edition.type}: ${edition.editionDescription} (${edition.npNumber}) ${!edition.license ? "(no license)" : !(edition.license.validFrom < endOfDay) ? "(not activated)" : !(edition.license.validTo > startOfDay) ? "(expired)" : ""}`,
                                            //disabled: !edition.npNumber,
                                            value: edition
                                        }
                                    }).sort((a, b) => {
                                        return !!b.value.npNumber - !!a.value.npNumber
                                        //return (b.value.license && b.value.license.validTo > startOfDay && b.value.license.validFrom < endOfDay) - (a.value.license && a.value.license.validTo > startOfDay && a.value.license.validFrom < endOfDay)
                                    })
                                }])).edition
                                axiosInstance({
                                    method: 'get',
                                    url: `https://www.allango.net/api/asset/access/public/pdf/${edition.npNumber}/daupdf`,
                                    headers: {
                                        'Authorization': `${token.token_type} ${token.access_token}`
                                    }
                                }).then(res => {
                                    var name = `${book.title} - ${book.bookDescription} - ${edition.editionDescription}_lossless`.replace(/ü/, 'u').replace(/ä/, 'a').replace(/ö/, 'o').replace(/Ü/, 'U').replace(/Ä/, 'A').replace(/Ö/, 'O').replace(/[^a-za-z0-9 \(\)_\-,\.]/gi, '');
                                    console.log("Starting download of " + name)
                                    axiosInstance({
                                        method: 'get',
                                        url: res.data.url,
                                        responseType: 'stream',
                                        headers: {
                                            Refereer: 'https://www.allango.net/dau/' + edition.npNumber
                                        }
                                    }).then(res => {
                                        res.data.pipe(fs.createWriteStream(`./out/${name}.pdf`)).on('finish', () => {
                                            console.log("Downloaded " + name)
                                        })
                                    }).catch(err => {
                                        console.log(err)
                                        console.log("allango pdf loading failed - e608")
                                    })
                                }).catch(err => {
                                    console.log(err)
                                    console.log("allango book loading failed - e608")
                                })
                            }).catch(err => {
                                console.log(err)
                                console.log("allango book loading failed - e607")
                            })
                        }).catch(err => {
                            console.log(err)
                            console.log("allango library loading failed - e606")
                        })
                    }).catch(err => {
                        console.log(err)
                        console.log("allango token loading failed - e605")
                    })
                }).catch(err => {
                    console.log(err)
                    console.log("allango login failed - e603")
                })
            }).catch(err => {
                console.log(err)
                console.log("allango login page loading failed - e602")
            })
        }).catch(err => {
            console.log(err)
            console.log("allango keycloak loading failed - e601")
        })
    }).catch(err => {
        console.log(err)
        console.log("allango website loading failed - e600")
    })
}
module.exports = allango;
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

function cornelsen(email, passwd, deleteAllOldTempImages, lossless) {
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
                    /*axiosInstance({
                        method: 'get',
                        url: "https://www.cornelsen.de/shop/capiadapter/link/eBibliothek"
                    }).then(res => {
                        axiosInstance({
                            method: 'get',
                            url: "https://mein.cornelsen.de/"
                        }).then(res => {
                            var parsed = HTMLParser.parse(res.data);
                            var jsfiles = parsed.querySelectorAll("script").map(i => i.getAttribute("src")).filter(i => i != null);
                            
                            axiosInstance({
                                method: 'get',
                                url: jsfiles.filter(i => i.match(/https:\/\/mein.cornelsen.de\/main\..*\.js/))[0]
                            }).then(res => {
                                axiosInstance({
                                    method: 'get',
                                    url: `https://mein.cornelsen.de/766.${res.data.match(/766\s*:\s*"(\w*)"\s*,/)[1]}.js`
                                }).then(res => {
                                    var clientId = res.data.match(/authority\s*:\s*"https:\/\/id.cornelsen.de\/"\s*,\s*clientId\s*:\s*"(.*?)"/m)[1];*/
                                    var clientId = "@!38C4.659F.8000.3A79!0001!7F12.03E3!0008!E3BA.CEBF.4551.8EBD" //from windows desktop app
                                    //console.log("Got client id: " + clientId)
                                    var code_verifier = crypto.randomBytes(48).toString('hex');
                                    var nonce = crypto.randomBytes(16).toString('hex')
                                    axiosInstance({
                                        method: "get",
                                        url: "https://id.cornelsen.de/oxauth/restv1/authorize",
                                        params: {
                                            scope: "openid user_name roles cv_sap_kdnr cv_schule profile email meta inum",
                                            response_type: "code",
                                            response_mode: "query",
                                            redirect_uri: "https://unterrichtsmanager.cornelsen.de/index.html",
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
                                        // console.log(res.headers.location)
                                        var code = res.headers.location.match(/code=(.*?)&/)[1];
                                        // console.log("Got code: " + code)
                                        axiosInstance({
                                            method: 'post',
                                            url: "https://id.cornelsen.de/oxauth/restv1/token",
                                            headers: {
                                                "content-type": "application/x-www-form-urlencoded",
                                            },
                                            data: qs.stringify({
                                                grant_type: "authorization_code",
                                                //redirect_uri: "https://mein.cornelsen.de",
                                                redirect_uri: "https://unterrichtsmanager.cornelsen.de/index.html",
                                                code: code,
                                                code_verifier: code_verifier,
                                                client_id: clientId,
                                            })
                                        }).then(res => {
                                            var id_token = res.data.id_token;

                                            // console.log("Got access token: " + id_token)

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
                                                    var productId = values.license?.usageProduct?.id || values.license?.salesProduct?.id;
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
                                                                productId: productId
                                                            }
                                                        }
                                                    }).then((res) => {
                                                        var name = (values.license?.usageProduct?.heading || values.license?.salesProduct?.heading) + " - " + (values.license?.usageProduct?.subheading || values.license?.salesProduct?.subheading);
                                                        prompts({
                                                            type: "select",
                                                            message: "Which method should be used?",
                                                            name: "method",
                                                            choices: [
                                                                {
                                                                    title: "New Method (lossless and small)",
                                                                    value: "new"
                                                                },
                                                                {
                                                                    title: "Old Method (lossy and large)",
                                                                    value: "old"
                                                                }
                                                            ]
                                                        }).then(promptres => {
                                                            if(promptres.method == "new") {
                                                                var filename = name.replace(/[^a-zA-Z0-9 \(\)_\-,\.]/gi, '') + `_lossless`;
                                                                var tmpFolder = "./out/DownloadTemp/" + filename + "/";
                                                                if (deleteAllOldTempImages && fs.existsSync(tmpFolder)) fs.rmSync(tmpFolder, {
                                                                    recursive: true,
                                                                });
                                                                axios({
                                                                    method: "get",
                                                                    url: "https://unterrichtsmanager.cornelsen.de/uma20/api/v2/umazip/" + productId,
                                                                    headers: {
                                                                        "authorization": "Bearer " + id_token,
                                                                    },
                                                                }).then(res => {
                                                                    axios({
                                                                        method: "get",
                                                                        url: res.data.url,
                                                                        responseType: "arraybuffer"
                                                                    }).then(async res => {
                                                                        console.log("Extracting zip")
                                                                        let zip = new AdmZip(res.data)
                                                                        zip.extractAllTo(tmpFolder, deleteAllOldTempImages)
                                                                        console.log("trying to open uma.json")
                                                                        var uma = JSON.parse(fs.readFileSync(path.join(tmpFolder,"uma.json")))

                                                                        let ebooks = []
                                                                        uma.ebookIsbnSbNum
                                                                            && fs.existsSync(path.join(tmpFolder, uma.ebookIsbnSbNum + "_sf.pdf")) &&
                                                                            ebooks.push({
                                                                                encryptedPath: path.join(tmpFolder, uma.ebookIsbnSbNum + "_sf.pdf"),
                                                                                fileName: filename + "_sf.pdf",
                                                                                comment: "Schülerfassung"
                                                                            })
                                                                        
                                                                        uma.ebookIsbnLbNum
                                                                            && fs.existsSync(path.join(tmpFolder, uma.ebookIsbnLbNum + "_lf.pdf")) &&
                                                                            ebooks.push({
                                                                                encryptedPath: path.join(tmpFolder, uma.ebookIsbnLbNum + "_lf.pdf"),
                                                                                fileName: filename + "_lf.pdf",
                                                                                comment: "Lehrerfassung"
                                                                            })

                                                                        console.log("Found " + ebooks.length + " ebooks: ", ebooks)
                                                                        console.log("Decrypting PDFs and adding metadata")

                                                                        let cipherargs = Buffer.from("YWVzLTEyOC1jYmN8R" + `CtEeEpTRn0yQjtrLTtDfQ==`, 'base64').toString("ascii").split("|")
                                                                        cipherargs = cipherargs.concat(cipherargs[1].split("").reverse().join(""))

                                                                        for(let ebook of ebooks) {
                                                                            let cipher = crypto.createDecipheriv(...cipherargs)
                                                                            let input = fs.createReadStream(ebook.encryptedPath)
                                                                            new Promise((resolve, reject) => {
                                                                                input.pipe(cipher).on("error", reject)
                                                                            }).catch(err => {
                                                                                console.log("Error decrypting PDF")
                                                                                console.log(err)
                                                                            })
                                                                            let output = await consumers.buffer(cipher)
                                                                            console.log("Decrypted " + ebook.fileName)

                                                                            let doc = await pdflib.PDFDocument.load(output)

                                                                            //let pageRefs = []
                                                                            //doc.catalog.Pages().traverse((node, ref) => node instanceof pdflib.PDFPageLeaf && pageRefs.push(ref))
                                                                            let pagesAnnotations = {}
                                                                            let pageMapping = {}

                                                                            function addOutlineChapter(chapter, root=false) {
                                                                                let ref = doc.context.nextRef()
                                                                                let map = new Map()
                                                                                if(root) {
                                                                                    map.set(pdflib.PDFName.Type, pdflib.PDFString.of("Outlines"))
                                                                                } else {
                                                                                    map.set(pdflib.PDFName.Title, pdflib.PDFString.of(chapter.headline))
                                                                                }
                                                                                if(chapter.pages && chapter.pages.length > 0) {
                                                                                    let arr = pdflib.PDFArray.withContext(doc.context)
                                                                                    arr.push(doc.getPage(chapter.pages[0]["pageNo"]).ref)
                                                                                    arr.push(pdflib.PDFName.of("XYZ"))
                                                                                    arr.push(pdflib.PDFNull)
                                                                                    arr.push(pdflib.PDFNull)
                                                                                    arr.push(pdflib.PDFNull)
                                                                                    map.set(pdflib.PDFName.of("Dest"), arr)


                                                                                    for(let page of chapter.pages) {
                                                                                        pageMapping[page.name] = page["pageNo"]
                                                                                        if(page.sections && page.sections.length > 0) {
                                                                                            let origin = doc.getPage(page["pageNo"])
                                                                                            //let refs = []
                                                                                            if(!pagesAnnotations[page["pageNo"]]) pagesAnnotations[page["pageNo"]] = []
                                                                                            for(let section of page.sections) {
                                                                                                if(!section.assets || section.assets.length == 0) continue
                                                                                                for(let asset of section.assets) {
                                                                                                    let realasset = uma.assets.find(a => a.id == asset.id)
                                                                                                    if(realasset.type == "PAGE" && realasset.link || realasset.type == "ASSET_REFERENCE") pagesAnnotations[page["pageNo"]].push(
                                                                                                        {
                                                                                                            Rect: [
                                                                                                                section.xPosition * origin.getWidth(),
                                                                                                                (1-section.yPosition) * origin.getHeight(),
                                                                                                                (section.xPosition + section.width) * origin.getWidth(),
                                                                                                                (1-(section.yPosition + section.height)) * origin.getHeight()
                                                                                                            ],
                                                                                                            ...realasset.type == "PAGE" ? {page: realasset.link} : {},
                                                                                                            ...realasset.type == "ASSET_REFERENCE" ? {url: realasset.threeQUrl || realasset.link} : {},
                                                                                                        }
                                                                                                    )
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                                if(chapter.chapters && chapter.chapters.length > 0) {
                                                                                    let chaptersDicts = chapter.chapters.map((c) => addOutlineChapter(c))
                                                                                    chaptersDicts.forEach((chapterDict, idx) => {
                                                                                        if(idx > 0) chapterDict.set(pdflib.PDFName.of("Prev"), doc.context.getObjectRef(chaptersDicts[idx - 1]))
                                                                                        if(idx < chaptersDicts.length - 1) chapterDict.set(pdflib.PDFName.of("Next"), doc.context.getObjectRef(chaptersDicts[idx + 1]))
                                                                                        chapterDict.set(pdflib.PDFName.of("Parent"), ref)
                                                                                    })
                                                                                    map.set(pdflib.PDFName.of("First"), doc.context.getObjectRef(chaptersDicts[0]))
                                                                                    map.set(pdflib.PDFName.of("Last"), doc.context.getObjectRef(chaptersDicts[chaptersDicts.length - 1]))
                                                                                    map.set(pdflib.PDFName.of("Count"), pdflib.PDFNumber.of(chaptersDicts.length))
                                                                                }
                                                                                let dict = pdflib.PDFDict.fromMapWithContext(map, doc.context)
                                                                                doc.context.assign(ref, dict)
                                                                                return dict
                                                                            }

                                                                            let outline = addOutlineChapter(uma.location, true)
                                                                            doc.catalog.set(pdflib.PDFName.of("Outlines"), doc.context.getObjectRef(outline))

                                                                            Object.entries(pagesAnnotations).forEach(([pageNo, annotations]) => {
                                                                                doc.getPage(parseInt(pageNo)).node.set(pdflib.PDFName.of("Annots"), doc.context.obj(
                                                                                    annotations.map(anno => doc.context.obj({
                                                                                        Type: "Annot",
                                                                                        Subtype: "Link",
                                                                                        Rect: anno.Rect,
                                                                                        ...anno.page ? {Dest: [doc.getPage(pageMapping[anno.page]).ref, "XYZ", null, null, null]} : {},
                                                                                        ...anno.url ? {A: {
                                                                                            S: "URI",
                                                                                            URI: pdflib.PDFString.of(anno.url)
                                                                                        }} : {},
                                                                                    }))
                                                                                ))
                                                                            })

                                                                            fs.writeFileSync("./out/" + ebook.fileName, await doc.save())
                                                                        }
                                                                        console.log("finished PDFs")
                                                                    }).catch(err => {
                                                                        console.log("Could not get zip - 7n1")
                                                                        console.log(err)
                                                                    })
                                                                }).catch(err => {
                                                                    console.log("Could not get zip - 7n0")
                                                                    console.log(err)
                                                                })
                                                            } else {
                                                                console.log("Loading possible qualities")
                                                                axiosInstance({
                                                                    method: 'get',
                                                                    url: res.data?.data?.startProduct
                                                                    //url: 'https://produkte.cornelsen.de/url/' + values.license?.usageProduct?.usagePlatformId + "/" + values.license?.usageProduct?.id + "/",
                                                                }).then(res => {
                                                                    var parsed = HTMLParser.parse(res.data);
                                                                    var jsfiles = parsed.querySelectorAll("script").map(i => i.getAttribute("src")).filter(i => i != null);
                                                                    var mainjsrelativepath = jsfiles.map(i => i.match(/(?:https:\/\/ebook.cornelsen.de\/)?(main\..*\.js)/)).filter(i=>i)[0][1]
                                                                    axiosInstance({
                                                                        method: 'get',
                                                                        url: "https://ebook.cornelsen.de/" + mainjsrelativepath
                                                                    }).then(res => {
                                                                        var pspdfkitversion = res.data.match(/protocol=.*, client=.*, client-git=[^\s"]*/)[0];
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
                                                                                    "x-cv-app-identifier": "uma_web_2023.18.3",
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
                                                                                        "pspdfkit-version": pspdfkitversion,
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
                                                                                            "pspdfkit-version": pspdfkitversion,
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
                                                                                            var tmpFolder = "./out/DownloadTemp/" + filename + "/";
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
                                                                                                    doc.pipe(fs.createWriteStream("./out/" + filename + ".pdf"))
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
                                                                                                    });
                                                                                                    doc.end();
                                                                                                    console.log(`finished creating PDF Document, saved at: ./out/${filename}.pdf`)
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
                                                                        console.log("Could not load ebook javascript - 757.5")
                                                                        console.log(err)
                                                                    })
                                                                }).catch(err => {
                                                                    console.log("Could not load book - 757")
                                                                    console.log(err)
                                                                });
                                                            }
                                                        })
                                                        return;
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
                                            console.log(`Could not get token - 754.5`)
                                        })
                                    }).catch(err => {
                                        console.log(err)
                                        console.log(`Could not authorize code_challenge - 754.4`)
                                    })
                                /*}).catch(err => {
                                    console.log(err)
                                    console.log(`Could not load 609.js - 754.3`)
                                })
                            }).catch(err => {
                                console.log(err)
                                console.log(`Could not load main.js - 754.2`)
                            })
                        }).catch(err => {
                            console.log(err)
                            console.log(`Could not load main page - 754.1`)
                        })
                    }).catch(err => {
                        console.log("Could not get library - 754")
                        console.log(err)
                    });*/
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

module.exports = cornelsen;
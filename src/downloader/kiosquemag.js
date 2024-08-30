
const axios = require('axios');
const axiosCookieJarSupport = require('axios-cookiejar-support').wrapper;
const tough = require('tough-cookie');
const HTMLParser = require('node-html-parser');

axiosCookieJarSupport(axios);


function kiosquemag(email, passwd, deleteAllOldTempImages) {
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
        url: "https://www.kiosquemag.com/login"
    }).then(res => {
        let root = HTMLParser.parse(res.data);
        let form = root.querySelector(".login-form form");
        let csrf = form.querySelector("#_csrf_shop_security_token").getAttribute("value");
        axiosInstance({
            method: 'post',
            url: "https://www.kiosquemag.com" + (form.getAttribute("action") ?? "/login-check"),
            headers: {
                "Content-Type": "application/json",
            },
            data: JSON.stringify({
                _csrf_shop_security_token: csrf,
                _username: email,
                _password: passwd
            })
        }).then(res => {
            console.log(res.data)
        }).catch(err => {
            console.log(err)
            console.log("kiosquemag login failed - e701")
        })
    }).catch(err => {
        console.log(err)
        console.log("kiosquemag login page loading failed - e700")
    })
}

module.exports = kiosquemag;
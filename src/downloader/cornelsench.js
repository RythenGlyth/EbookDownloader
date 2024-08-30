
const axios = require('axios').default;
const axiosCookieJarSupport = require('axios-cookiejar-support').wrapper;
axiosCookieJarSupport(axios);
const tough = require('tough-cookie');
const crypto = require('crypto');
const prompts = require('prompts')
const fs = require('fs')
const { spawn } = require('child_process')

async function cornelsench(email, passwd, deleteAllOldTempImages, lossless) {
    const browser_name = "Chrome";
    const browser_version = "128.0.0.0";
    const uid = crypto.randomUUID()
    const cookieJar = new tough.CookieJar();
    const axiosInstance = axios.create({
        jar: cookieJar,
        withCredentials: true,
        headers: {
            'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ${browser_name}/${browser_version} Safari/537.36`,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
        }
    });

    /**
     * @type {{ customer_id: number, device_id: number, drm_salt: string, fullUsername: string, is_guest: boolean, last_filters: any, last_issue: number, offline_hash: string, restricted: boolean, session_id: string, socket_token: string, success: number, toc: number, uid: string, username: string }}
     */
    const authres = (await axiosInstance({
        method: "POST",
        url: "https://admin.molib.com/api/642/authenticate.php",
        params: {
            browser_name,
            browser_version,    
            browser_viewport_height: 1080,
            browser_viewport_width: 1920,
            screen_height: 1080,
            screen_width: 1920,
            isReact: true,
            lang: "de",
            model: "",
            os_name: "Windows",
            os_version: "10",
            type: "webreader",
            email,
            password: crypto.createHash('md5').update(passwd).digest("hex"),
            uid
        }
    }).catch(e => {
        console.error(e)
        console.error("Login failed - e801")
        process.exit(1)
    })).data

    const purchasedBooks = (await axiosInstance({
        method: "GET",
        url: "https://admin.molib.com/api/642/getPurchasedBooks.php",
        params: {
            isReact: true,
            lang: "de",
            uid,
            session_id: authres.session_id
        }
    }).catch(e => {
        console.error(e)
        console.error("Getting purchased books failed - e802")
        process.exit(1)
    })).data

    const selectedbook = (await prompts([{
        type: (prev, values) => values.publisher == "cornelsen" ? null : 'autocomplete',
        name: 'book',
        message: "Choose Book",
        choices: Object.values(purchasedBooks).map(x=> x.issue).flat(1).map(x => ({title: `${x.title_name} ${x.issue_name}`, value: x}))
    }])).book

    const xodPass = generateXodPassword(authres.drm_salt, selectedbook.publisher_id, selectedbook.issue_id, selectedbook.update_ts)
    
    const genpdfres = (await axiosInstance({
        method: "GET",
        url: "https://admin.molib.com/api/642/generate_api.php",
        params: {
            action: "generateWebPDFTronIssue",
            isReact: true,
            lang: "de",
            uid,
            session_id: authres.session_id,
            issue_id: selectedbook.issue_id
        }
    }).catch(e => {
        console.error(e)
        console.error("Generating xod file failed - e803")
        process.exit(1)
    })).data

    /**
     * @type {Buffer}
     */
    const xodfile = (await axiosInstance({
        method: "GET",
        url: `https://admin.molib.com/${genpdfres.path}/publication.xod?v=${selectedbook.update_ts}`,
        responseType: 'arraybuffer'
    }).catch(e => {
        console.error(e)
        console.error("Getting xod failed - e804")
        process.exit(1)
    })).data

    const filename = selectedbook.title_name + " " + selectedbook.issue_name

    const eocd_index = xodfile.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    const central_dir_size = xodfile.readUInt32LE(eocd_index + 12)
    const central_dir_offset = xodfile.readUInt32LE(eocd_index + 16)

    let central_dir_pos = central_dir_offset - 1
    while(central_dir_pos < central_dir_offset + central_dir_size) {
        central_dir_pos = xodfile.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), central_dir_pos+1)
        if(central_dir_pos == -1) {
            break
        }
        // const filename_len = xodfile.readUInt16LE(central_dir_pos + 28)
        // const filename = xodfile.toString('utf8', central_dir_pos + 46, central_dir_pos + 46 + filename_len)

        const local_file_header_offset = xodfile.readUInt32LE(central_dir_pos + 42)
        const local_file_header_pos = xodfile.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), local_file_header_offset)
        const local_file_header_filename_len = xodfile.readUInt16LE(local_file_header_pos + 26)
        const local_file_header_filename = xodfile.toString('utf8', local_file_header_pos + 30, local_file_header_pos + 30 + local_file_header_filename_len)
        const local_file_header_extra_field_len = xodfile.readUInt16LE(local_file_header_pos + 28)
        const compressed_size = xodfile.readUInt32LE(local_file_header_pos + 18)
        const data_offset = local_file_header_pos + 30 + local_file_header_filename_len + local_file_header_extra_field_len

        const { key, iv, encrypted_data } = getKeyAndIVByPassAndData(xodfile.subarray(data_offset, data_offset + compressed_size), local_file_header_filename, xodPass)

        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv)
        const decrypted_data = decipher.update(encrypted_data)
        const final = Buffer.concat([decrypted_data, decipher.final()])

        const buff_to_write = Buffer.alloc(compressed_size)
        final.copy(buff_to_write)
        buff_to_write.copy(xodfile, data_offset)

        xodfile.writeUInt32LE(final.length, local_file_header_pos + 18)
        xodfile.writeUInt32LE(final.length, central_dir_pos + 20)
    }

    fs.mkdirSync(`./out/DownloadTemp/${filename}`, {recursive: true})
    fs.writeFileSync(`./out/DownloadTemp/${filename}/${filename}.xps`, xodfile)

    const mutool = spawn('mutool', ['convert', '-F', 'pdf', '-o', `./out/${filename}.pdf`, `./out/DownloadTemp/${filename}/${filename}.xps`])

    await new Promise((resolve, reject) => {
        mutool.on('close', resolve)
        mutool.on('error', reject)
    }).catch(e => {
        console.error(e)
        console.error("Converting xps to pdf failed - e805")
        process.exit(1)
    })

    console.log("PDF saved to ./out/" + filename + ".pdf")
}

function generateXodPassword(drm_salt, publisher_id, issue_id, update_ts) {
    const md5 = crypto.createHash('md5');
    md5.update(publisher_id + drm_salt + issue_id + drm_salt + update_ts + drm_salt);
    let md5part = md5.digest('hex');
    const sha1 = crypto.createHash('sha1');
    sha1.update(drm_salt + md5part + drm_salt);
    return sha1.digest('hex');
}

/**
 * 
 * @param {Buffer} encrypted_data 
 * @param {string} filename 
 * @param {string} password 
 * @returns 
 */
function getKeyAndIVByPassAndData(encrypted_data, filename, password) {
    const key = Buffer.alloc(16)
    for (let i = 0; i < 16; i++) {
        key[i] = i
        if(i < password.length) {
            key[i] |= password.charCodeAt(i)
        }
        const w = filename.length + i - 16
        if(w >= 0) {
            key[i] |= filename.charCodeAt(w)
        }
    }

    return {
        iv: encrypted_data.subarray(0, 16),
        encrypted_data: encrypted_data.subarray(16),
        key
    }
}

module.exports = cornelsench;
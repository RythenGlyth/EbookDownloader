var Iconv = require('iconv').Iconv;

var iconv = new Iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE');

var buf = Buffer.from("75 6e 64 20 68 c3 a4 75 66 ef bf bf 67 6b 65 69 74".replace(/ /g, ""), "hex").toString().replace(/\uFFFF/g, 'i');

console.log(buf);
console.log(Buffer.from("und häuf\uFFFDgkeit", "utf-8"));
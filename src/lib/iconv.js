// Pure-JS drop-in replacement for the native `iconv` package's `Iconv` class.
//
// The native `iconv` module requires node-gyp + a C++ toolchain (Visual Studio
// on Windows) to compile. `iconv-lite` is pure JavaScript and needs no build
// step, so we wrap it to expose the same `new Iconv(from, to).convert(buf)` API
// the codebase already uses.
var iconvLite = require('iconv-lite');

// `iconv-lite` does not understand GNU iconv suffixes like `//TRANSLIT` or
// `//IGNORE`, so strip them down to the base encoding name.
function normalizeEncoding(encoding) {
    return String(encoding).split('//')[0].trim();
}

function Iconv(fromEncoding, toEncoding) {
    this.fromEncoding = normalizeEncoding(fromEncoding);
    this.toEncoding = normalizeEncoding(toEncoding);
}

// Mirrors node-iconv: `input` may be a Buffer or a string (treated as UTF-8
// bytes). Returns a Buffer encoded in `toEncoding`.
Iconv.prototype.convert = function convert(input) {
    var buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    var decoded = iconvLite.decode(buffer, this.fromEncoding);
    return iconvLite.encode(decoded, this.toEncoding);
};

module.exports = { Iconv: Iconv };

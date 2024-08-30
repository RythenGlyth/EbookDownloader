
function zeroPad(num, places) {
    return String(num).padStart(places, '0');
}

function expandToNearestJSONObject(input, pos) {
    var p0 = pos;
    for (var braces = 0; braces != -1; p0--) {
        if (input[p0] == "}") braces++;
        if (input[p0] == "{") braces--;
    }
    var p1 = pos;
    for (var braces = 0; braces != -1; p1++) {
        if (input[p1] == "{") braces++;
        if (input[p1] == "}") braces--;
    }

    eval("var out =" + input.slice(p0 + 1, p1))
    return out
}

module.exports = {
    zeroPad,
    expandToNearestJSONObject
}
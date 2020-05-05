/* tslint:disable:no-bitwise */

export const qfontAsciiTable: string[] = [
     "\0", "#",  "#",  "#",  "#",  ".",  "#",  "#",
     "#",  "\t", "\n", "#",  " ",  "\r", ".",  ".",
     "[",  "]",  "0",  "1",  "2",  "3",  "4",  "5",
     "6",  "7",  "8",  "9",  ".",  "<",  "=",  ">",
     " ",  "!",  '"',  "#",  "$",  "%",  "&",  "'",
     "(",  ")",  "*",  "+",  ",",  "-",  ".",  "/",
     "0",  "1",  "2",  "3",  "4",  "5",  "6",  "7",
     "8",  "9",  ":",  ";",  "<",  "=",  ">",  "?",
     "@",  "A",  "B",  "C",  "D",  "E",  "F",  "G",
     "H",  "I",  "J",  "K",  "L",  "M",  "N",  "O",
     "P",  "Q",  "R",  "S",  "T",  "U",  "V",  "W",
     "X",  "Y",  "Z",  "[",  "\\", "]",  "^",  "_",
     "`",  "a",  "b",  "c",  "d",  "e",  "f",  "g",
     "h",  "i",  "j",  "k",  "l",  "m",  "n",  "o",
     "p",  "q",  "r",  "s",  "t",  "u",  "v",  "w",
     "x",  "y",  "z",  "{",  "|",  "}",  "~",  "<",
     "<",  "=",  ">",  "#",  "#",  ".",  "#",  "#",
     "#",  "#",  " ",  "#",  " ",  ">",  ".",  ".",
     "[",  "]",  "0",  "1",  "2",  "3",  "4",  "5",
     "6",  "7",  "8",  "9",  ".",  "<",  "=",  ">",
     " ",  "!",  '"',  "#",  "$",  "%",  "&",  "'",
     "(",  ")",  "*",  "+",  ",",  "-",  ".",  "/",
     "0",  "1",  "2",  "3",  "4",  "5",  "6",  "7",
     "8",  "9",  ":",  ";",  "<",  "=",  ">",  "?",
     "@",  "A",  "B",  "C",  "D",  "E",  "F",  "G",
     "H",  "I",  "J",  "K",  "L",  "M",  "N",  "O",
     "P",  "Q",  "R",  "S",  "T",  "U",  "V",  "W",
     "X",  "Y",  "Z",  "[",  "\\", "]",  "^",  "_",
     "`",  "a",  "b",  "c",  "d",  "e",  "f",  "g",
     "h",  "i",  "j",  "k",  "l",  "m",  "n",  "o",
     "p",  "q",  "r",  "s",  "t",  "u",  "v",  "w",
     "x",  "y",  "z",  "{",  "|",  "}",  "~",  "<"
    ];

export const qfontUnicodeTable: string[] = [
    " ", " ", "\u2014", " ", "_", "\u2747", "\u2020",
    "\u00b7", "\ud83d\udd2b", " ", " ", "\u25a0",
    "\u2022", "\u2192", "\u2748", "\u2748", "[", "]",
    "\ud83d\udc7d", "\ud83d\ude03", "\ud83d\ude1e",
    "\ud83d\ude35", "\ud83d\ude15", "\ud83d\ude0a",
    "\u00ab", "\u00bb", "\u2022", "\u203e", "\u2748",
    "\u25ac", "\u25ac", "\u25ac", " ", "!", "\"", "#",
    "$", "%", "&", "'", "(", ")", "\u00d7", "+", ",",
    "-", ".", "/", "0", "1", "2", "3", "4", "5", "6",
    "7", "8", "9", ":", ";", "<", "=", ">", "?", "@",
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
    "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T",
    "U", "V", "W", "X", "Y", "Z", "[", "\\", "]", "^",
    "_", "'", "a", "b", "c", "d", "e", "f", "g", "h",
    "i", "j", "k", "l", "m", "n", "o", "p", "q", "r",
    "s", "t", "u", "v", "w", "x", "y", "z", "{", "|",
    "}", "~", "\u2190", "<", "=", ">", "\ud83d\ude80",
    "\u00a1", "O", "U", "I", "C", "\u00a9", "\u00ae",
    "\u25a0", "\u00bf", "\u25b6", "\u2748", "\u2748",
    "\u2772", "\u2773", "\ud83d\udc7d", "\ud83d\ude03",
    "\ud83d\ude1e", "\ud83d\ude35", "\ud83d\ude15",
    "\ud83d\ude0a", "\u00ab", "\u00bb", "\u2747", "x",
    "\u2748", "\u2014", "\u2014", "\u2014", " ", "!",
    "\"", "#", "$", "%", "&", "'", "(", ")", "*", "+",
    ",", "-", ".", "/", "0", "1", "2", "3", "4", "5",
    "6", "7", "8", "9", ":", ";", "<", "=", ">", "?",
    "@", "A", "B", "C", "D", "E", "F", "G", "H", "I",
    "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S",
    "T", "U", "V", "W", "X", "Y", "Z", "[", "\\", "]",
    "^", "_", "'", "A", "B", "C", "D", "E", "F", "G",
    "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q",
    "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "{",
    "|", "}", "~", "\u25c0"
];

const smallColors = [
    0x888, 0xf00, 0x3f0, 0xff0,
    0x36f, 0x3ff, 0xf36, 0xfff,
    0x999, 0x888
];

const enum DPTextParserState {
    Initial = 0,
    Caret,
    Hex0,
    Hex1,
    Hex2
}

const enum ColorType {
    Short,
    Hex
}

type XonColor = [ColorType, number];

const digitRe = /^\d$/;
const hexDigitRe = /^[\dA-F]$/i;

class DPTextParser {

    private hex: number;
    private buffer: string;
    private decoding: string;
    private state: DPTextParserState;

    constructor() {
        this.hex = 0;
        this.buffer = "";
        this.decoding = "";
        this.state = DPTextParserState.Initial;
    }

    public write(data: string) {
        this.buffer += data;
    }

    public next(): string | XonColor | null {
        if (this.buffer.length <= 0) {
            return null;
        }

        if (this.state === DPTextParserState.Initial && this.buffer[0] !== "^") {
            let i = 0;
            while (i < this.buffer.length && this.buffer[i] !== "^") {
                i++;
            }
            const res = this.buffer.slice(0, i);
            this.buffer = this.buffer.slice(i);
            return res;
        }

        while (this.buffer.length > 0) {
            switch (this.state) {
                case DPTextParserState.Initial:
                    if (this.buffer[0] === "^") {
                        this.decoding += "^";
                        this.buffer = this.buffer.slice(1);
                        this.state = DPTextParserState.Caret;
                    } else {
                        const res = this.buffer[0];
                        this.buffer = this.buffer.slice(1);
                        return res;
                    }
                    break;
                case DPTextParserState.Caret:
                    if (this.buffer[0] === "^") {
                        this.state = DPTextParserState.Initial;
                        this.decoding = "";
                        this.buffer = this.buffer.slice(1);
                        return "^";
                    } else if (this.buffer[0] === "x") {
                        this.state = DPTextParserState.Hex0;
                        this.decoding += this.buffer[0];
                        this.buffer = this.buffer.slice(1);
                    } else if (digitRe.test(this.buffer[0])) {
                        this.state = DPTextParserState.Initial;
                        this.decoding = "";
                        const res = parseInt(this.buffer[0], 10);
                        this.buffer = this.buffer.slice(1);
                        return [ColorType.Short, res];
                    } else {
                        this.state = DPTextParserState.Initial;
                        const res = this.decoding;
                        this.decoding = "";
                        return res;
                    }
                    break;
                case DPTextParserState.Hex0:
                case DPTextParserState.Hex1:
                case DPTextParserState.Hex2:
                    if (hexDigitRe.test(this.buffer[0])) {
                        this.decoding += this.buffer[0];
                        this.hex =  (this.hex << 4) + parseInt(this.buffer[0], 16);
                        this.buffer = this.buffer.slice(1);
                        this.state++;
                        if (this.state > DPTextParserState.Hex2) {
                            this.state = DPTextParserState.Initial;
                            const res = this.hex;
                            this.decoding = "";
                            this.hex = 0;
                            return [ColorType.Hex, res];
                        }
                    } else {
                        this.state = DPTextParserState.Initial;
                        const res = this.decoding + this.buffer[0];
                        this.hex = 0;
                        this.decoding = "";
                        this.buffer = this.buffer.slice(1);
                        return res;
                    }
                    break;
            }
        }
        return null;
    }

    public end(): string {
        const res = this.decoding;
        this.decoding = "";
        return res;
    }
}

function decodeQChars(str: string, qtable: string[] = qfontUnicodeTable): string {
    let out = [];
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (0xe000 <= code && code <= 0xe0ff) {
            out.push(qtable[code - 0xe000]);
        } else {
            out.push(str.charAt(i));
        }
    }
    return out.join("");
}

export function dpcolorStyle(color: number, defaultColor: number = 0xfff): string {
    if (color === defaultColor) {
        return "";
    }
    let r = ((color >> 8) & 0xf).toString(16);
    let g = ((color >> 4) & 0xf).toString(16);
    let b = (color & 0xf).toString(16);
    return "#" + r + r + g + g + b + b;
}

export type ColorMap = (c: number, d: number) => string;

// ^x466i^x975n^xDA2c^xC64o^x435g^xD32n^x924i^x696c^x894o^x258 ٩(^ᴗ^)۶^7
// "^x466i^x975n^xDA2c^xC64o^x435g^xD32n^x924i^x696c^x894o^x258 ٩(^ᴗ^)۶^7"
export function dptextDOM(str: string, defaultColor: number = 0xfff,
                          colorMap: ColorMap = dpcolorStyle): HTMLSpanElement {

    let baseElem = document.createElement("span");
    let elem = baseElem;
    let prevColor = defaultColor;
    let parser = new DPTextParser();
    let token: string | XonColor | null;
    let color = prevColor;
    parser.write(str);
    for (;;) {
        token = parser.next();
        if (typeof token === "string") {
            if (color !== prevColor) {
                let newElem = document.createElement("span");
                newElem.style.color = colorMap(color, defaultColor);
                baseElem.appendChild(newElem);
                elem = newElem;
            }
            elem.innerText += decodeQChars(token);
        } else if (typeof token === "object" && token !== null) {
            prevColor = color;
            if (token[0] === ColorType.Short) {
                color = smallColors[token[1]];
            } else {
                color = token[1];
            }
        } else if (token === null) {
            break;
        }
    }
    elem.innerText += parser.end();
    return baseElem;
}

/*
//let testText = "Abc^1^2again^xFFFand^xfff";
let testText = "Abc^1^2again^xFFFand^xfff^xabchere";
let parser = new DPTextParser();
parser.write(testText);
/*
console.log(parser.next());
console.log(parser.next());
console.log(parser.next());
console.log(parser.next());
console.log(parser.next());
console.log(parser.next());
console.log(parser.next());
console.log(parser.next());
*/
/*
for (;;) {
    let res = parser.next();
    if (res != null) {
        if (typeof res === "string") {
            console.log(decodeQChars(res));
        } else {
            console.log(res);
        }
    } else {
        console.log(parser.end());
        break;
    }
}

let dom = dptextDOM(testText);
document.addEventListener('DOMContentLoaded', function() {
    document.body.appendChild(dom);
    //document.body.innerHTML = 'test';
    console.log("done");
})
*/

/*
let testText = "^x466i^x975n^xDA2c^xC64o^x435g^xD32n^x924i^x696c^x894o^x258 ٩(^ᴗ^)۶^7";
let parser = new DPTextParser();
parser.write(testText);
for (;;) {
    let res = parser.next();
    if (res != null) {
        if (typeof res === "string") {
            console.log(decodeQChars(res));
        } else {
            console.log(res);
        }
    } else {
        console.log(parser.end());
        break;
    }
}
*/

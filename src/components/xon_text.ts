import { customElement, LitElement, property } from "lit-element";
import { dptextDOM , dpcolorStyle} from "../dptext";
import { adjustContrast, rgbClamp } from "../colors";

const cssRGBre = /rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i;

export function parseCssColor(color: string): undefined | number {
    const match = cssRGBre.exec(color);
    if (!match) {
        return undefined;
    }
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
        return undefined;
    } else {
        return rgbClamp(r) << 16 | rgbClamp(g) << 8 | rgbClamp(b);
    }
}

function getColorMappingFun(background: number, contrastRatio: number = 4.5): (c: number, d: number) => string {
    const mapFun = adjustContrast(background, contrastRatio);
    return (c: number, defaultColor: number) => {
        if (c === defaultColor) {
            return "";
        }
        const r = (c >> 8) & 0xf;
        const g = (c >> 4) & 0xf;
        const b = c & 0xf;
        let color = (r << 4 | r) << 16 | (g << 4 | g) << 8 | (b << 4 | b);
        color = mapFun(color);
        return `rgb(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255})`;
    };
}

@customElement("xon-text")
export class XonTextComponent extends LitElement {
    @property ({type: String}) public text = "";
    // recommended contrast ratio is 4.5 but it changes some colors too much
    private static readonly contrastRatio: number = 2.25;
    private _colorMappingFunction: undefined | ((c: number, d: number) => string) = undefined;
    private _prevBackground: undefined | string = undefined;

    private backgroundColor(): undefined | string {
        const prop = window.getComputedStyle(document.body).getPropertyValue('background-color');
        return (prop) ? prop : undefined;
    }

    private updateBackgroundFun() {
        const newBackground = this.backgroundColor();
        if (newBackground === undefined) {
            return;
        }
        if (this._colorMappingFunction === undefined || newBackground !== this._prevBackground) {
            this._prevBackground = newBackground;
            const parsedBackground = parseCssColor(newBackground);
            if (typeof parsedBackground === "number") {
                this._colorMappingFunction = getColorMappingFun(parsedBackground, XonTextComponent.contrastRatio);
            }
        }
    }

    public connectedCallback() {
        super.connectedCallback();
        this.updateBackgroundFun();
    }

    public render() {
        this.updateBackgroundFun();
        const mapFunc = (this._colorMappingFunction) ? this._colorMappingFunction : dpcolorStyle;
        return dptextDOM(this.text, 0xfff, mapFunc);
    }
}

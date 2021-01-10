/* eslint-disable no-bitwise */

export const sRGBd65Profile = [
    0.4124564, 0.3575761, 0.1804375,
    0.2126729, 0.7151522, 0.0721750,
    0.0193339, 0.1191920, 0.9503041
];

// profile**-1
export const sRGBd65InvProfile = [
    3.24045484, -1.53713885, -0.49853155,
    -0.96926639,  1.87601093,  0.04155608,
    0.05564342, -0.20402585,  1.05722516
];


export const sRGBd50Profile = [
    0.4360747, 0.3850649, 0.1430804,
    0.2225045, 0.7168786, 0.0606169,
    0.0139322, 0.0971045, 0.7141733
];

export const sRGBd50InvProfile = [
    3.13385637, -1.61686677, -0.49061477,
    -0.97876856,  1.91614155,  0.03345412,
    0.07194517, -0.22899128,  1.40524267
];

export const d65WhiteRef = [0.95047, 1.0000001, 1.08883];
export const d50WhiteRef = [0.96422, 1.0, 0.82521];

export interface XYZColor {
    x: number;
    y: number;
    z: number;
}

export interface LABColor {
    l: number;
    a: number;
    b: number;
}

export interface HSLColor {
    h: number;
    s: number;
    l: number;
}

interface dRGBColor {
    r: number;
    g: number;
    b: number;
}

function rgbTodRGB(rgb: number): dRGBColor {
    return {
        r: ((rgb >> 16) & 255) / 255,
        g: ((rgb >> 8) & 255) / 255,
        b: (rgb & 255) / 255
    };
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function rgbClamp(value: number): number {
    return clamp(value, 0, 255);
}

export function rgbToXYZWithProfile(profile: readonly number[], rgb: number): XYZColor {
    function pivot(v: number): number {
        return (v > 0.04045) ?  Math.pow(((v + 0.055) / 1.055), 2.4) : v / 12.92;
    }
    let {r, g, b} = rgbTodRGB(rgb);
    r = pivot(r);
    g = pivot(g);
    b = pivot(b);
    return {
        x: profile[0] * r + profile[1] * g + profile[2] * b,
        y: profile[3] * r + profile[4] * g + profile[5] * b,
        z: profile[6] * r + profile[7] * g + profile[8] * b
    }
}

export function xyzToRGBWithProfile(invProfile: readonly number[], xyz: XYZColor): number {
    function pivot(v: number): number {
        return (v > 0.0031308072830676845) ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : v * 12.92;
    }
    const {x, y, z} = xyz;
    let r = pivot(invProfile[0] * x + invProfile[1] * y + invProfile[2] * z);
    let g = pivot(invProfile[3] * x + invProfile[4] * y + invProfile[5] * z);
    let b = pivot(invProfile[6] * x + invProfile[7] * y + invProfile[8] * z);
    return rgbClamp(Math.round(r * 255)) << 16 |
        rgbClamp(Math.round(g * 255)) << 8 |
        rgbClamp(Math.round(b * 255));
}

export function xyzToLab(white: readonly number[], xyz: XYZColor): LABColor {
    const epsilon = 216 / 24389;
    const kappa = 24389 / 27;
    function pivot(t: number) {
        return (t > epsilon) ?  Math.pow(t, 1 / 3) : (kappa * t + 16) / 116;
    }

    let {x, y, z} = xyz;
    x /= white[0];
    y /= white[1];
    z /= white[2];
    return {
        l: 116 * pivot(y) - 16,
        a: 500 * (pivot(x) - pivot(y)),
        b: 200 * (pivot(y) - pivot(z))
    };
}

export function labToXYZ(white: readonly number[], lab: LABColor): XYZColor {
    const epsilon = 216 / 24389;
    const kappa = 24389 / 27;
    const {l, a, b} = lab;
    const fy = (l + 16) / 116;
    const fz = fy - b / 200;
    const fx = a / 500 + fy;
    const fx3 = Math.pow(fx, 3);
    const fz3 = Math.pow(fz, 3);

    const xr = (fx3 > epsilon) ? fx3 : (116 * fx - 16) / kappa;
    const yr = (l > kappa * epsilon) ? Math.pow((l + 16) / 116, 3) : l / kappa;
    const zr = (fz3 > epsilon) ? fz3 : (116 * fz - 16) / kappa;
    return {
        x: xr * white[0],
        y: yr * white[1],
        z: zr * white[2]
    }
}

export function rgbToHSL(rgb: number): HSLColor {
    const {r, g, b} = rgbTodRGB(rgb);
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);

    let h: number, s: number, l: number;
    l = (max + min) / 2;
    if (max == min) {
        //achromatic
        h = s = 0;
    } else {
        const delta = (max - min);
        s = (l > 0.5) ?  delta / (2 - max - min) : delta / (max + min);
        const rc = (max - r) / delta;
        const gc = (max - g) / delta;
        const bc = (max - b) / delta;
        if (r == max) {
            h = bc - gc
        } else if (g == max) {
            h = 2.0 + rc - bc;
        } else {
            h = 4.0 + gc - rc;
        }
        h = (h / 6.0) % 1.0;
    }
    return {h: h,s: s, l: l};
}

export function hslToRGB(hsl: HSLColor): number {
    const {h, s, l} = hsl;

    function pivot(m1: number, m2: number, hue: number): number {
        if (hue < 0) {
            hue += 1;
        }
        if (hue > 1) {
            hue -= 1;
        }
        if (hue < 1/6) {
            return m1 + (m2 - m1) * hue * 6;
        } else if (hue < 0.5) {
            return m2;
        } else if (hue < 2/3) {
            return m1 + (m2 - m1) * (2 / 3 - hue) * 6;
        }
        return m1;
    }

    if (s === 0.0) {
        const temp = rgbClamp(Math.round(l * 255));
        return temp << 16 | temp << 8 | temp;
    }

    const m2 = (l < 0.5) ? l * (1 + s) : l + s - l * s;
    const m1 = 2.0 * l - m2;
    const r = pivot(m1, m2, h + 1/3);
    const g = pivot(m1, m2, h);
    const b = pivot(m1, m2, h - 1/3);
    return (rgbClamp(Math.round(r * 255)) << 16) |
        (rgbClamp(Math.round(g * 255)) << 8) |
        rgbClamp(Math.round(b * 255));
}


export function rgbToLab(rgb: number, profile: readonly number[] = sRGBd65Profile,
                  white: readonly number[] = d65WhiteRef): LABColor {

    return xyzToLab(white, rgbToXYZWithProfile(profile, rgb));
}

export function labToRgb(lab: LABColor, invProfile: readonly number[] = sRGBd65InvProfile,
                  white: readonly number[] = d65WhiteRef): number {

    return xyzToRGBWithProfile(invProfile, labToXYZ(white, lab));
}

// wcag20 relative luminance
// almost same as y from xyz, but have different constant, see this: https://github.com/w3c/wcag/issues/360
export function rgbRelativeLuminance(color: number): number {
    function pivot(v: number): number {
        // outdated constant
        return (v <= 0.03928) ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    const rg = pivot(((color >> 16) & 255) / 255);
    const gg = pivot(((color >> 8) & 255) / 255);
    const bg = pivot((color & 255) / 255);
    return 0.2126 * rg + 0.7152 * gg + 0.0722 * bg;
}

export function adjustContrast(background: number, contrastRatio: number = 4.5): (color: number) => number {
    const backgroundLum = rgbRelativeLuminance(background);
    const backgroundXyz = rgbToXYZWithProfile(sRGBd65Profile, background);
    const newLumaDark = (backgroundXyz.y + 0.05) / contrastRatio - 0.05;
    const newLumaLight = (backgroundXyz.y + 0.05) * contrastRatio - 0.05;
    const white = d65WhiteRef;
    const profile = sRGBd65Profile;
    const invProfile = sRGBd65InvProfile;
    let balance: (color: number) => number = (color: number) => {
        const lum = rgbRelativeLuminance(color);
        if (backgroundLum >= lum && backgroundLum > 0.05) {
            const contrast = (backgroundLum + 0.05) / (lum + 0.05);
            if (contrast >= contrastRatio) {
                return color;
            } else {
                let xyz = rgbToXYZWithProfile(profile, color);
                const labOrig = xyzToLab(white, xyz);
                xyz.y = newLumaDark;
                const labNew = xyzToLab(white, xyz);
                labOrig.l = labNew.l;
                return labToRgb(labOrig, invProfile, white);
            }
        } else {
            const contrast = (lum + 0.05) / (backgroundLum + 0.05);
            if (contrast >= contrastRatio) {
                return color;
            } else {
                let xyz = rgbToXYZWithProfile(profile, color);
                const labOrig = xyzToLab(white, xyz);
                xyz.y = newLumaLight;
                const labNew = xyzToLab(white, xyz);
                labOrig.l = labNew.l;
                return labToRgb(labOrig, invProfile, white);
            }
        }
    };

    return balance;
}

type WebPFeatures = "lossy" | "lossless" | "alpha" | "animation";
type WebPFeatureCallback = (feature: WebPFeatures, result: boolean) => void;

/* eslint-disable */
const testImages = {
    lossy: "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
    lossless: "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
    alpha: "UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==",
    animation: "UklGRlIAAABXRUJQVlA4WAoAAAASAAAAAAAAAAAAQU5JTQYAAAD/////AABBTk1GJgAAAAAAAAAAAAAAAAAAAGQAAABWUDhMDQAAAC8AAAAQBxAREYiI/gcA"
};
/* eslint-enable */

export const CheckWebPFeature = (() => {
    let detectWebp;
    if (self.document) {
        detectWebp = (feature: WebPFeatures, callback: WebPFeatureCallback) => {
            const imgUrl = "data:image/webp;base64," + testImages[feature];
            let img = new Image();
            img.onload = () => {
                const result = (img.width > 0) && (img.height > 0);
                callback(feature, result);
            };
            img.onerror = () => {
                callback(feature, false);
            };
            img.src = imgUrl;
        };
    } else {
        // Image is not available in worker context
        detectWebp = (feature: WebPFeatures, callback: WebPFeatureCallback) => {
            if (self.createImageBitmap === undefined) {
                // assume it's not available
                callback(feature, false);
                return;
            }
            const imgUrl = "data:image/webp;base64," + testImages[feature];
            (async () => {
                const resp = await fetch(imgUrl);
                const blob = await resp.blob();
                const bitmap = await createImageBitmap(blob);
                const result = (bitmap.width > 0) && (bitmap.height > 0);
                callback(feature, result);
            })().catch(() => {
                callback(feature, false);
            });
        };
    }

    return detectWebp;
})();

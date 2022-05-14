import * as navigationPreload from 'workbox-navigation-preload';
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { StaleWhileRevalidate, CacheFirst } from "workbox-strategies";
import { BroadcastUpdatePlugin } from "workbox-broadcast-update";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { CheckWebPFeature } from "./webp_detection";

let wbManifest = self.__WB_MANIFEST || [];
const mapshotURL = MAPSHOT_BASE_URL || "";
const precacheMaps = [
    "evilspace_deepsky_v1r2", "chaos", "cubearena_sc_v1", "nexdance",
    "dissocia", "dna", "dreamscape_r1", "dusty_symb", "dusty_v2r1",
    "gib_warehouse_v2r1", "implosion", "lostspace2",
    "powerstation_r2", "recratemini", "rusty_r3", "spectrum_2",
    "symdusty_v2r3", "symdusty_xon_r2", "tarx", "trance",
    "warehouse_xon", "hub3aeroq3a_nex_r4"
];

precacheAndRoute(wbManifest);

CheckWebPFeature("alpha", (_feature, val) => {
    const ext = (val) ? ".webp" : ".jpg";
    const precacheImgs = precacheMaps.map((name) => [mapshotURL, name, ext].join(""));
    precacheAndRoute(precacheImgs.map((url) => {
        return {url: url, revision: null};
    }));
});

const indexHandler = createHandlerBoundToURL("index.html");
const navigationRoute = new NavigationRoute(indexHandler, {
    allowlist: [
        /^$/,
        /^records\/$/i,
        /^servers\/$/i,
    ]
});

navigationPreload.enable();
registerRoute(navigationRoute);

registerRoute(
    /^https?:\/\/api.regulars.win\/(records|maps)$/i,
    new StaleWhileRevalidate({
        plugins: [
            new BroadcastUpdatePlugin(),
        ]
    })
);

registerRoute(
    /images\/[^\/]+\.(?:png|gif|jpg|jpeg|svg|webp)$/,
    new CacheFirst({
        cacheName: "images",
        plugins: [
            new ExpirationPlugin({
                maxEntries: 30,
                maxAgeSeconds: 30 * 24 * 60 * 60,
            }),
        ]
    })
);

registerRoute(
    /^https:\/\/fonts\.googleapis\.com/,
    new StaleWhileRevalidate({
        cacheName: "google-fonts-stylesheets",
    })
);

registerRoute(
    /^https:\/\/fonts\.gstatic\.com/,
    new CacheFirst({
        cacheName: "google-fonts-webfonts",
        plugins: [
            new CacheableResponsePlugin({
                statuses: [0, 200]
            }),
            new ExpirationPlugin({
                maxAgeSeconds: 365 * 24 * 60 * 60,
                maxEntries: 40
            })
        ]
    })
);

registerRoute(
    /^https?:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\//i,
    new CacheFirst({
        cacheName: "cdnjs-libs",
        plugins: [
            new CacheableResponsePlugin({
                statuses: [0, 200]
            }),
            new ExpirationPlugin({
                maxAgeSeconds: 365 * 24 * 60 * 60,
                maxEntries: 50
            })
        ]
    })
);

registerRoute(
    /^https:\/\/dl.regulars.win\/mapshots\//i,
    new CacheFirst({
        cacheName: "mapshot-cache",
        matchOptions: {
            ignoreVary: true
        },
        plugins: [
            new ExpirationPlugin({
                maxEntries: 700,
                maxAgeSeconds: 30 * 24 * 60 * 60,
                purgeOnQuotaError: true
            }),
            new CacheableResponsePlugin({
                statuses: [0, 200, 404]
            })
        ]
    })
);

self.addEventListener("message", (evt) => {
    if (evt.data && evt.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

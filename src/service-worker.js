import * as navigationPreload from 'workbox-navigation-preload';
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { StaleWhileRevalidate, CacheFirst } from "workbox-strategies";
import { BroadcastUpdatePlugin } from "workbox-broadcast-update";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

let wbManifest = self.__WB_MANIFEST || [];
const mapshotURL = MAPSHOT_BASE_URL || "";
const precacheMaps = [
    "blockscape-inverted.jpg", "centermatchbig_v4_s.jpg",
    "chaos.jpg", "cubearena_sc_v1.jpg",
    "dissocia.jpg", "dna.jpg",
    "dreamscape_r1.jpg", "dusty_symb.jpg",
    "dusty_v2r1.jpg", "evil(space)ctf-inverted.jpg",
    "furia_4.jpg", "gib_warehouse_v2r1.jpg",
    "implosion.jpg", "inverted_dance.jpg",
    "inverted_lostspace2.jpg", "iris.png",
    "lostspace2.jpg", "powerstation_r2.jpg",
    "recratemini.jpg", "rusty_r3.jpg",
    "spectrum_2.jpg", "squareb4.jpg",
    "symdusty_v2r3.jpg", "symdusty_xon_r2.jpg",
    "tarx.jpg", "trance.jpg",
    "warehouse_xon.jpg",
];


wbManifest = wbManifest.concat(precacheMaps.map((mapimg) => {
    return {
        url: [mapshotURL, mapimg].join(""),
        revision: null
    }
}));

precacheAndRoute(wbManifest);
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
    /images\/[^\/]+\.(?:png|gif|jpg|jpeg|svg)$/,
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

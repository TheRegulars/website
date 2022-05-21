import "./components/xon_text";
import "./components/mapshot";
import "./components/mapshot_tooltip";
import "./components/records";
import "./components/xon_status";
import { Workbox, messageSW } from "workbox-window";
import { WorkboxLifecycleEvent  } from "workbox-window/utils/WorkboxEvent";
import { TemplateRouter } from "./router";

function loadFont(href: string) {
    let link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}

function loadFonts() {
    loadFont("https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&display=swap");
    loadFont("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/solid.min.css");
}

function documentReady() {
    let router = new TemplateRouter();
    loadFonts();
    router.documentReady();
}

function documentLoad() {
    if ("serviceWorker" in navigator) {
        const wb = new Workbox("/sw.js");

        // this called when new worker is waiting till old one finished (all tabs is closed)
        function handleWorkerWaiting(evt: WorkboxLifecycleEvent) {
            // TODO: maybe show prompt instead of refresh ?
            wb.addEventListener("controlling", (_evt: WorkboxLifecycleEvent) => {
                // reload page when new worker took controll
                window.location.reload();
            });
            if (evt.sw) {
                messageSW(evt.sw, {type: "SKIP_WAITING"});
            }
        }

        wb.addEventListener("waiting", handleWorkerWaiting);
        wb.register();
    }
}

document.addEventListener("DOMcontentLoaded", documentReady);
window.addEventListener("load", documentLoad);
if (document.readyState !== "loading") {
    documentReady();
}

if (document.readyState === "complete") {
    documentLoad();
}

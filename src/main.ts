import { TemplateRouter } from "./router";
import  "./components/xon_text";
import  "./components/mapshot";
import  "./components/mapshot_tooltip";
import  "./components/records";
import  "./components/xon_status";

function loadFont(href: string) {
    let link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}

function loadFonts() {
    loadFont("https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&display=swap");
    loadFont("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.13.0/css/solid.min.css");
}

function documentReady() {
    let router = new TemplateRouter();
    loadFonts();
    router.documentReady();
}

function documentLoad() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js");
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

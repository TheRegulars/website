import { TemplateRouter } from "./router";
import  "./components/mapshot";
import  "./components/records";
import  "./components/xon_status";

function loadFonts() {
    let link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=PT+Mono&family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap";
    document.head.appendChild(link);
}

function documentReady() {
    let router = new TemplateRouter();
    loadFonts();
    router.documentReady();
}

document.addEventListener("DOMcontentLoaded", documentReady);
if (document.readyState !== "loading") {
    documentReady();
}

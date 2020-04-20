
export class TemplateRouter {

    public contentContainer: HTMLElement | null = null;
    public initialized: boolean = false;
    public routes: {[key: string]: HtmlTemplateElement} = {};
    public activeLinks: HtmlLinkElement = [];
    public attachedLinks: HtmlLinkElement = [];

    public loadRoutes() {
        document.querySelectorAll("template[page-url]").forEach((template) => {
            const url = template.getAttribute("page-url");
            if (!url) {
                return;
            }
            this.routes[url] = template;
        });
    }

    public changeRoute(path: string, pushHistory: boolean) {
        const template = this.routes[path];
        if (template === undefined || this.contentContainer === null) {
            return;
        }
        const title = template.getAttribute("title");
        this.contentContainer.innerHTML = "";
        this.contentContainer.appendChild(document.importNode(template.content, true));
        this.activeLinks.forEach((link) => {
            link.classList.remove("active");
        });
        this.activeLinks = [];
        this.attachedLinks.forEach((link) => {
            if (link.pathname === path) {
                link.classList.add("active");
                this.activeLinks.push(link);
            }
        });
        if (pushHistory) {
            window.history.pushState({path}, title, path);
        } else {
            window.history.replaceState({path}, title);
        }
        document.title = title;
    }

    public popstateHandler(event: PopStateEvent) {
        const eventState = event.state;
        if (!eventState || eventState.path === undefined) {
            return;
        }
        this.changeRoute(eventState.path, false);
    }

    public clickHandler(event: MouseEvent) {
        if (event.target.tagName !== "A") {
            return true;
        }
        const elem: HtmlLinkElement = event.target;
        if (elem.pathname in this.routes) {
            event.preventDefault();
            this.changeRoute(elem.pathname, true);
            return false;
        }
        return true;
    }

    public bindLinks() {
        document.querySelectorAll("a[router]").forEach((link) => {
            link.addEventListener("click", this.clickHandler.bind(this));
            if (link.classList.contains("active")) {
                this.activeLinks.push(link);
            }
            this.attachedLinks.push(link);
        });
    }

    public documentReady() {
        if (!this.initialized) {
            this.loadRoutes();
            this.bindLinks();
            window.addEventListener("popstate", this.popstateHandler.bind(this));
            this.contentContainer = document.querySelector("[content-container]");
            this.changeRoute(window.location.pathname, false);
            this.initialized = true;
        }
    }
}

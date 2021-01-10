
export class TemplateRouter {

    public contentContainer: HTMLElement | null = null;
    public initialized = false;
    public routes: {[key: string]: HTMLTemplateElement} = {};
    public activeLinks: HTMLAnchorElement[] = [];
    public attachedLinks: HTMLAnchorElement[] = [];

    public loadRoutes() {
        document.querySelectorAll("template[page-url]").forEach((template) => {
            const url = template.getAttribute("page-url");
            if (!url) {
                return;
            }
            this.routes[url] = template as HTMLTemplateElement;
        });
    }

    public changeRoute(path: string, pushHistory: boolean) {
        const template = this.routes[path];
        if (template === undefined || this.contentContainer === null) {
            return;
        }
        const title = template.getAttribute("title") || "";
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
        /* eslint-disable */
        const eventState = event.state;
        if (!eventState || eventState.path === undefined) {
            return;
        }
        this.changeRoute(eventState.path as string, false);
        /* eslint-enable */
    }

    public clickHandler(event: MouseEvent) {
        const elem: HTMLAnchorElement = event.target as HTMLAnchorElement;
        if (elem?.tagName !== "A") {
            return true;
        }
        if (elem.pathname in this.routes) {
            event.preventDefault();
            this.changeRoute(elem.pathname, true);
            return false;
        }
        return true;
    }

    public bindLinks() {
        document.querySelectorAll("a[router]").forEach((elem) => {
            const link = elem as HTMLAnchorElement;
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


export class TemplateRouter {

    private static cleanupURLRe = /index\.html?/i;
    public contentContainer: HTMLElement | null = null;
    public initialized = false;
    private routes: {[key: string]: HTMLTemplateElement} = {};
    private activeLinks: HTMLAnchorElement[] = [];
    private attachedLinks: HTMLAnchorElement[] = [];
    private indexRedirect: boolean = true;
    private page404Template: HTMLTemplateElement | undefined = undefined;

    public loadRoutes() {
        document.querySelectorAll("template[page-url]").forEach((template) => {
            const url = template.getAttribute("page-url");
            if (!url) {
                return;
            }
            if (template.hasAttribute("page-404")) {
                this.page404Template = template as HTMLTemplateElement;
            } else {
                this.routes[url] = template as HTMLTemplateElement;
            }
        });
    }

    public changeRoute(path: string, pushHistory: boolean) {
        if (this.contentContainer === null) {
            return;
        }
        if (TemplateRouter.cleanupURLRe.test(path)) {
            path = path.replace(TemplateRouter.cleanupURLRe, "");
            if (this.indexRedirect) {
                this.changeRoute(path, true);
                return;
            }
        }
        const template = this.routes[path] || this.page404Template;
        if (template === undefined) {
            this.contentContainer.innerText = "Error 404, couldn't find template";
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

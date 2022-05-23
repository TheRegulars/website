const enum AnimationState {
    Disappearing,
    DisappearingDone,
    Appearing,
    Done,
}

function waitAnimation(anim: Animation): Promise<"finish" | "cancel"> {
    let done = false;
    return new Promise<"finish" | "cancel">((resolve, reject) => {
        try {
            anim.addEventListener("finish", () => {
                if (!done) {
                    done = true;
                    resolve("finish");
                }
            });
            anim.addEventListener("cancel", () => {
                if (!done) {
                    done = true;
                    resolve("cancel");
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

class DOMAnimation {

    private couldAnimate: boolean = false;
    private animationState: AnimationState = AnimationState.Done;
    private insertElement?: HTMLElement = undefined;
    private state: number = 0;
    private previousState: number = 0;

    constructor() {
        try {
            const reducedAnimation = window.matchMedia("(prefers-reduced-motion: reduce)");
            this.couldAnimate = !reducedAnimation.matches;
            reducedAnimation.addEventListener("change", (evt) => {
                this.couldAnimate = !evt.matches;
            });
        } catch {
            this.couldAnimate = false;
        }
        if (document.getAnimations === undefined) {
            this.couldAnimate = false;
        }
    }

    private get mobileScreenSize() {
        return window.innerWidth <= 500;
    }

    public replaceAnimation(parent: HTMLElement, elem: HTMLElement, state: number = 0) {
        this.previousState = this.state;
        this.state = state;
        this.insertElement = elem;
        if (this.couldAnimate) {
            if (this.animationState === AnimationState.Done ||
                this.animationState === AnimationState.Appearing) {

                this.removeOld(parent).then(() => {
                    return this.insertNew(parent);
                }).then(() => {
                    this.animationState = AnimationState.Done;
                });
            }
        } else {
            while (parent.firstChild) {
                parent.removeChild(parent.firstChild);
            }
            parent.appendChild(elem);
            this.animationState = AnimationState.Done;
        }
    }

    private animateableNode(elem: Node): boolean {
        return elem.nodeName === "DIV";
    }

    private async animateDisappear(elem: HTMLElement) {
        let anim: Animation;
        if (!elem.parentNode) {
            return;
        }
        if (this.previousState === 0) {
            anim = elem.animate(
                [{opacity: 0.95}, {opacity: 0}],
                {duration: 110, easing: "ease-in"}
            );
        } else if (this.mobileScreenSize) {
            const sign = (this.previousState > this.state) ? "" : "-";
            anim = elem.animate(
                [{opacity: 0, transform: "translateX(0%)"}, {opacity: 1, transform: `translate(${sign}100%)`}],
                {duration: 180, easing: "ease-in"}
            );
        } else {
            anim = elem.animate(
                [{opacity: 0.95, transform: "scale(1)"}, {opacity: 0, transform: "scale(1.04)"}],
                {duration: 140, easing: "ease-in"}
            );
        }
        anim.play();
        await waitAnimation(anim);
        if (elem.parentNode) {
            elem.parentNode.removeChild(elem);
        }
    }

    private async removeOld(parent: HTMLElement) {
        this.animationState = AnimationState.Disappearing;
        if (!parent.hasChildNodes()) {
            this.animationState = AnimationState.DisappearingDone;
            return;
        }
        const childs = [];
        /* eslint-disable */
        for (let i = 0; i < parent.childNodes.length; i++) {
            childs.push(parent.childNodes[i]);
        }
        /* eslint-enable */
        const tasks = [];
        for (let child of childs) {
            if (this.animateableNode(child)) {
                tasks.push(this.animateDisappear(child as HTMLElement));
            } else {
                // remove element without animation
                parent.removeChild(child);
            }
        }
        await Promise.all(tasks);
        this.animationState = AnimationState.DisappearingDone;
    }

    private async insertNew(parent: HTMLElement) {
        this.animationState = AnimationState.Appearing;
        let anim: Animation;

        const elem = this.insertElement;
        if (!elem) {
            return;
        }
        parent.appendChild(elem);
        if (this.previousState === 0 || !this.mobileScreenSize) {
            anim = elem.animate(
                [{opacity: 0, transform: "scale(0.985)"}, {opacity: 1, transform: "scale(1)"}],
                {duration: 210, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)"}
            );
        } else {
            const sign = (this.previousState <= this.state) ? "" : "-";
            anim = elem.animate(
                [{opacity: 0, transform: `translateX(${sign}100%)`}, {opacity: 1, transform: "translateX(0%)"}],
                {duration: 320, easing: "ease-out"}
            );
        }
        anim.play();
        await waitAnimation(anim);
        this.animationState = AnimationState.Done;
    }

}

export class TemplateRouter {

    private static cleanupURLRe = /index\.html?/i;
    public contentContainer: HTMLElement | null = null;
    public initialized = false;
    private routes: {[key: string]: HTMLTemplateElement} = {};
    private activeLinks: HTMLAnchorElement[] = [];
    private attachedLinks: HTMLAnchorElement[] = [];
    private indexRedirect: boolean = true;
    private page404Template: HTMLTemplateElement | undefined = undefined;
    private animation: DOMAnimation;
    private currentURL: string | undefined = undefined;


    constructor() {
        this.animation = new DOMAnimation();
    }

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
        if (this.currentURL === path) {
            return;
        }
        const template = this.routes[path] || this.page404Template;
        if (template === undefined) {
            this.contentContainer.innerText = "Error 404, couldn't find template";
            return;
        }
        const title = template.getAttribute("title") || "";
        const div = document.createElement("div");
        div.classList.add("content-main");
        div.appendChild(document.importNode(template.content, true));
        const animState = parseInt(template.getAttribute("animation-state") || "0", 10);
        this.animation.replaceAnimation(this.contentContainer, div, animState);
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
        this.currentURL = path;
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

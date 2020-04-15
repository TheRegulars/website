import { dptextDOM } from "./dptext"
import { LitElement, html, css, customElement, property } from 'lit-element';


abstract class FetchComponent extends LitElement {
    @property({type: String}) url: string = '';
    @property({type: Number}) reloadInterval: number = -1;
    private timerId: number | null = null;
    static get observedAttributes() {
        return ['data-url', 'reload-interval'];
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === "data-url") {
            this.url = newValue;
        } else if (name === 'reload-interval') {
            this.reloadInterval = parseInt(newValue, 10);
        } else {
            super.attributeChangedCallback(name, oldValue, newValue);
        }
    }

    fetchUrl(): Promise<Object> {
        return fetch(this.url).then((resp) => {
            if (!resp.ok) {
                throw Error(resp.statusText);
            }
            return resp.json();
        }).catch((err) => {
            console.log(err);
        });
    }

    enableAutoRefresh() {
        if (this.reloadInterval > 0) {
            this.timerId = setInterval(this.reloadData.bind(this), this.reloadInterval * 1000);
        }
    }

    disableAutoRefresh() {
        if (this.timerId !== null) {
            clearInterval(this.timerId);
        }
    }

    abstract loadData(): void;

    reloadData() {
        this.loadData();
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.url) {
            this.loadData();
            this.enableAutoRefresh();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.disableAutoRefresh();
    }

}

@customElement('xon-records')
export class RecordsComponent extends FetchComponent {

    static pageRegexp = /^#?page-(\d+)$/i;

    @property({type: Boolean}) loaded = false;
    @property({type: Array}) records = [];
    @property({type: Number}) pageBy = 50;
    @property({type: Number}) currentPage = 1;
    private hashChangeHandler = null;

    constructor() {
        super();
        this.setCurrentPage();
    }

    setCurrentPage() {
        const match = RecordsComponent.pageRegexp.exec(window.location.hash);
        if (match !== null) {
            const page = parseInt(match[1], 10);
            if (!Number.isNaN(page) && page > 0) {
                if (!this.loaded || page <= this.pages) {
                    this.currentPage = page;
                } else {
                    this.currentPage = this.pages;
                }
            }
        }
    }

    changePage(page: number) {
        this.currentPage = page;
        const newUrl = document.location.pathname + `#page-${page}`;
        window.history.pushState(window.history.state, document.title, newUrl)
    }

    connectedCallback() {
        super.connectedCallback();
        this.hashChangeHandler = this.hashChange.bind(this);
        window.addEventListener("hashchange", this.hashChangeHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('hashchange', this.hashChangeHandler);
    }

    hashChange(event: HashChangeEvent) {
        this.setCurrentPage();
    }

    loadData() {
        this.fetchUrl().then((data) => {
            this.loaded = true;
            this.records = Object.keys(data).sort().map((mapname) => {
                const record = data[mapname];
                return {
                    map: mapname,
                    player: record.name,
                    value: record.val
                };
            });
            if (this.currentPage > this.pages) {
                this.changePage(this.pages);
            }
        });
    }

    static get styles() {
        return css`
            @font-face{
                font-family: 'Xolonium';
                src:
                    url('fonts/xolonium-regular.woff2') format('woff2'),
                    url('fonts/xolonium-regular.woff') format('woff');
                    url('fonts/xolonium-regular.ttf') format('truetype');
                    url('fonts/xolonium-regular.eot') format('embedded-opentype');
                font-weight: normal;
                font-style: normal;
            }

            .col-map {
                width: 40%;
            }

            .col-record {
                width: 10%
            }

            .col-nick {
                width: 50%;
            }

            table {
                font-family: Xolonium, sans-serif;
                text-align: left;
                margin-top: 1.2rem 0;
                border-collapse: collapse;
                width: 100%;
            }

            thead {
                text-align: center;
                font-size: 0.88em;
            }

            thead th {
                vertical-align: bottom;
                padding-bottom: 12px;
            }

            tbody tr:hover {
                background-color: rgba(255, 255, 255, 0.1);
            }

            tbody td {
                font-size: 0.92em;
            }

            table td {
                padding: 1px 5px;
                margin: 1px;
                vertical-align: top;
                white-space: nowrap;
            }

            .pagination {
                display: flex;
                list-style: none;
                padding-left: 0;
                align-items: center;
                justify-content: center;
                margin-top: 25px;
            }

            .pagination button {
                cursor: pointer;
                display: block;
                position: relative;
                color: #fff;
                background-color: #00bc8c;
                border: 0 solid transparent;
                line-height: 1.25;
                margin-left: 0;
                padding: 0.5rem 0.75rem;
                font-size: 0.76em;
            }

            .pagination button:hover {
                background-color: #00efb2;
            }

            .pagination button:focus {
                box-shadow: 0 0 0 0.2rem rgba(55, 90, 127, 0.25);
                outline: 0;
            }

            .pagination .active button {
                background-color: #00efb2;
            }

            .pagination .disabled button {
                pointer-events: none;
                cursor: auto;
                background-color: #007053;
                border-color: transparent;
            }

            .td-record {
                text-align: center;
            }

            @media screen and (max-width: 550px) {
                div {
                    font-size: 0.8rem;
                }
            }
            @media screen and (max-width: 450px) {
                div {
                    font-size: 0.69rem;
                }
            }
        `;
    }

    get pages(): number {
        if (!this.loaded || this.pageBy <= 0) {
            return 1;
        }
        return Math.ceil(this.records.length / this.pageBy);
    }

    listRecords(page: number) {
        if (!this.loaded || page > this.pages || page < 1) {
            return [];
        }
        const start = this.pageBy * (page - 1);
        const end = this.pageBy * page;
        return this.records.slice(start, end);
    }

    clickPage(event: MouseEvent) {
        const newPage = parseInt(event.target.getAttribute('switch-page'), 10);
        if (!Number.isNaN(newPage) && newPage >= 1 && newPage <= this.pages) {
            this.changePage(newPage);
        }
        event.preventDefault();
        return false;
    }

    renderPagination() {
        const pages = this.pages;
        if (pages <= 1) {
            return html``;
        }
        let pagesList = [];
        for (let i = 1; i <= pages; i++) {
            pagesList.push({
                page: i,
                active: i == this.currentPage
            });
        }
        const eventHandler = this.clickPage.bind(this);
        const prevPageHTML = (this.currentPage === 1 ?
            html`<li class="disabled"><button>«</button></li>` :
            html`<li><button switch-page="${this.currentPage - 1}" @click=${eventHandler}>«</button></li>`
        );
        const nextPageHTML = (this.currentPage === pages ?
            html`<li class="disabled"><button>»</button></li>` :
            html`<li><button switch-page="${this.currentPage + 1}" @click=${eventHandler}>»</button></li>`
        );
        return html`
        <ul class="pagination">
        ${prevPageHTML}
        ${pagesList.map((page) => {
            if (page.active) {
                return html`<li class="active"><button>${page.page}</button></li>`;
            } else {
                return html`<li><button switch-page="${page.page}" @click="${eventHandler}">${page.page}</button></li>`;
            }
        })}
        ${nextPageHTML}
        </ul>
        `;
    }

    render() {
        if (!this.loaded) {
            return html`<span>Loading records...</span>`;
        } else {
            return html`
            <div>
            <table>
            <colgroup>
                <col class="col-map">
                <col class="col-record">
                <col class="col-nick">
            </colgroup>
            <thead>
            <tr>
                <th>Map</th>
                <th>Record time</th>
                <th>Player</th>
            </tr>
            </thead>
            <tbody>
            ${this.listRecords(this.currentPage).map((item) => {
                return html`
                <tr>
                    <td>${item.map}</td>
                    <td class="td-record">${item.value.toFixed(3)}</td>
                    <td>${dptextDOM(item.player)}</td>
                </tr>
                `;
            })}
            </tbody>
            </table>
            ${this.renderPagination()}
            </div>
            `
        }
    }
}

@customElement('xon-status')
export class StatusComponents extends FetchComponent {

    loadData() {
    }

    render() {
        return html`<p>Status</p>`;
    }
}

class TemplateRouter {

    contentContainer: HTMLElement | null = null;
    initialized: boolean = false;
    routes: {[key: string]: HtmlTemplateElement} = {};
    activeLinks: HtmlLinkElement = [];
    attachedLinks: HtmlLinkElement = [];

    loadRoutes() {
        document.querySelectorAll('template[page-url]').forEach((template) => {
            const url = template.getAttribute("page-url");
            if (!url) {
                return;
            }
            this.routes[url] = template;
        });
    }

    changeRoute(path: string, pushHistory: boolean) {
        const template = this.routes[path];
        if (template === undefined || this.contentContainer === null) {
            return;
        }
        const title = template.getAttribute('title');
        this.contentContainer.innerHTML = '';
        this.contentContainer.appendChild(document.importNode(template.content, true));
        this.activeLinks.forEach((link) => {
            link.classList.remove("active");
        });
        this.activeLinks = [];
        this.attachedLinks.forEach((link) => {
            if (link.pathname == path) {
                link.classList.add("active");
                this.activeLinks.push(link);
            }
        });
        if (pushHistory) {
            window.history.pushState({path: path}, title, path);
        } else {
            window.history.replaceState({path: path}, title);
        }
        document.title = title;
    }

    popstateHandler(event: PopStateEvent) {
        const eventState = event.state;
        if (!eventState || eventState.path === undefined) {
            return;
        }
        this.changeRoute(eventState.path, false);
    }

    clickHandler(event: MouseEvent) {
        if (event.target.tagName !== 'A') {
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

    bindLinks() {
        document.querySelectorAll('a[router]').forEach((link) => {
            link.addEventListener('click', this.clickHandler.bind(this));
            if (link.classList.contains("active")) {
                this.activeLinks.push(link);
            }
            this.attachedLinks.push(link);
        });
    }

    documentReady() {
        if (!this.initialized) {
            this.loadRoutes();
            this.bindLinks();
            window.addEventListener('popstate', this.popstateHandler.bind(this));
            this.contentContainer = document.querySelector('[content-container]');
            this.changeRoute(window.location.pathname, false);
            this.initialized = true;
        }
    }
}


function documentReady() {
    let router = new TemplateRouter();
    router.documentReady();
}

document.addEventListener('DOMcontentLoaded', documentReady);
if (document.readyState !== "loading") {
    documentReady();
}

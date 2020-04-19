import { css, customElement, html, LitElement, property } from "lit-element";
import { dptextDOM } from "./dptext";

abstract class FetchComponent extends LitElement {
    static get observedAttributes() {
        return super.observedAttributes.concat(["data-url", "reload-interval"]);
    }
    private timerId: number | null = null;
    @property({type: String}) public url: string = "";
    @property({type: Number}) public reloadInterval: number = -1;

    public attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === "data-url") {
            this.url = newValue;
        } else if (name === "reload-interval") {
            this.reloadInterval = parseInt(newValue, 10);
        } else {
            super.attributeChangedCallback(name, oldValue, newValue);
        }
    }

    public fetchUrl(): Promise<object> {
        return fetch(this.url).then((resp) => {
            if (!resp.ok) {
                throw Error(resp.statusText);
            }
            return resp.json();
        }).catch((err) => {
            console.log(err);
        });
    }

    public enableAutoRefresh() {
        if (this.reloadInterval > 0) {
            this.timerId = setInterval(this.reloadData.bind(this), this.reloadInterval * 1000);
        }
    }

    public disableAutoRefresh() {
        if (this.timerId !== null) {
            clearInterval(this.timerId);
        }
    }

    public abstract loadData(): void;

    public reloadData() {
        this.loadData();
    }

    public connectedCallback() {
        super.connectedCallback();
        if (this.url) {
            this.loadData();
            this.enableAutoRefresh();
        }
    }

    public disconnectedCallback() {
        super.disconnectedCallback();
        this.disableAutoRefresh();
    }

}

@customElement("xon-records")
export class RecordsComponent extends FetchComponent {

    static get styles() {
        return css`
            col.col-map {
                width: 40%;
            }

            col.col-record {
                width: 10%
            }

            col.col-nick {
                width: 50%;
            }

            table {
                font-family: Xolonium, sans-serif;
                text-align: left;
                margin-top: 1.2rem 0;
                border-collapse: collapse;
                table-layout: fixed;
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

            td.col-nick, td.col-map {
                overflow: hidden;
                text-overflow: ellipsis;
            }
            td.col-nick {
                padding-left: 15px;
            }
            td.col-record {
                text-align: center;
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
                margin: 0;
            }

            .pagination li:first-child button {
                border-top-left-radius: 0.25rem;
                border-bottom-left-radius: 0.25rem;
            }

            .pagination li:last-child button {
                border-top-right-radius: 0.25rem;
                border-bottom-right-radius: 0.25rem;
            }

            @media (hover: hover) {
                .pagination button:hover {
                    background-color: #00efb2;
                }

                .pagination button:focus {
                    box-shadow: 0 0 0 0.2rem rgba(55, 90, 127, 0.25);
                    outline: 0;
                }
            }

            @media (hover: none) {
                .pagination button:ative {
                    background-color: #00efb2;
                    box-shadow: 0 0 0 0.2rem rgba(55, 90, 127, 0.25);
                    outline: 0;
                }
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

            @media screen and (max-width: 650px) {
                div {
                    font-size: 0.8em;
                }
            }

            @media screen and (max-width: 550px) {
                div {
                    font-size: 0.78em;
                }
            }
            @media screen and (max-width: 460px) {
                div {
                    font-size: 0.66em;
                }
            }
            @media screen and (max-width: 360px) {
                div {
                    font-size: 0.58em;
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

    public static pageRegexp = /^#?page-(\d+)$/i;
    private hashChangeHandler = null;

    @property({type: Boolean}) public loaded = false;
    @property({type: Array}) public records = [];
    @property({type: Number}) public pageBy = 50;
    @property({type: Number}) public currentPage = 1;

    constructor() {
        super();
        this.setCurrentPage();
    }

    public setCurrentPage() {
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

    public changePage(page: number) {
        this.currentPage = page;
        const newUrl = document.location.pathname + `#page-${page}`;
        window.history.pushState(window.history.state, document.title, newUrl);
    }

    public connectedCallback() {
        super.connectedCallback();
        this.hashChangeHandler = this.hashChange.bind(this);
        window.addEventListener("hashchange", this.hashChangeHandler);
    }

    public disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener("hashchange", this.hashChangeHandler);
    }

    public hashChange(event: HashChangeEvent) {
        this.setCurrentPage();
    }

    public loadData() {
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

    public listRecords(page: number) {
        if (!this.loaded || page > this.pages || page < 1) {
            return [];
        }
        const start = this.pageBy * (page - 1);
        const end = this.pageBy * page;
        return this.records.slice(start, end);
    }

    public clickPage(event: MouseEvent) {
        const newPage = parseInt(event.target.getAttribute("switch-page"), 10);
        if (!Number.isNaN(newPage) && newPage >= 1 && newPage <= this.pages) {
            this.changePage(newPage);
        }
        event.preventDefault();
        return false;
    }

    public renderPagination() {
        const pages = this.pages;
        if (pages <= 1) {
            return html``;
        }
        let pagesList = [];
        for (let i = 1; i <= pages; i++) {
            pagesList.push({
                page: i,
                active: i === this.currentPage
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

    public render() {
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
                    <td class="col-map">${item.map}</td>
                    <td class="col-record">${item.value.toFixed(3)}</td>
                    <td class="col-nick">${dptextDOM(item.player)}</td>
                </tr>
                `;
            })}
            </tbody>
            </table>
            ${this.renderPagination()}
            </div>
            `;
        }
    }
}

@customElement("xon-mapshot")
export class MapshotComponent extends LitElement {
    public static mapshotApi: string = "https://dl.regulars.win/mapshots/";
    public static missingMapshot: string = "/images/nopreview_map.png";
    @property({type: String}) public map = "";
    @property ({type: Boolean}) public loaded = false;
    private imgDOM: Image | undefined = undefined;

    static get styles() {
        return css`
        :host {
            display: block;
        }
        img {
            width: 100%;
            height: auto;
            object-fit: contain;
        }
        `;
    }

    private mapshotURL(ext: string = "png"): string {
        return `${MapshotComponent.mapshotApi}${this.map.toLowerCase()}.${ext}`;
    }

    private loadImage() {
        let pngImg = new Image(); 
        let jpgImg = new Image();
        let missingImg = new Image();
        pngImg.src = this.mapshotURL("png");
        jpgImg.src = this.mapshotURL("jpg");
        missingImg.src = MapshotComponent.missingMapshot;
        let pngPromise = new Promise((resolve, reject) => {
            pngImg.onload = (() => resolve(pngImg));
            pngImg.onerror = pngImg.onAbort = ((evt) => reject(evt));
        });
        let jpgPromise = new Promise((resolve, reject) => {
            jpgImg.onload = (() => resolve(jpgImg));
            jpgImg.onerror = jpgImg.onAbort = ((evt) => reject(evt));
        });
        pngPromise.then((img) => {
            // cancel jpg loading
            jpgImg.src = "";
            this.imgDOM = img;
            this.loaded = true;
            jpgPromise.catch(() => {}); // ignore jpg
        }).catch(() => {
            jpgPromise.then((img) => {
                this.imgDOM = img;
                this.loaded = true;
            }).catch(() => {
                this.imgDOM = missingImg;
                this.loaded = true;
            });
        });
    }

    public connectedCallback() {
        super.connectedCallback();
        this.loadImage();
    }

    public render() {
        if (!this.loaded) {
            return html`<div>loading...</div>`;
        } else {
            return html`${this.imgDOM}`;
        }
    }
}

@customElement("xon-status")
export class StatusComponents extends FetchComponent {

    @property({type: Object}) public serverStatus = {};
    @property({type: Number}) public reloadInterval: number = 120;
    @property({type: String}) public connectHost: string = "";
    @property({type: String}) public xonStatsUrl: string = "";
    @property({type: Boolean}) public loaded = false;

    static get observedAttributes() {
        return super.observedAttributes.concat(['connect-host', 'xon-stats-url']);
    }

    public attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === "connect-host") {
            this.connectHost = newValue;
        } else if (name === "xon-stats-url") {
            this.xonStatsUrl = newValue;
        } else {
            super.attributeChangedCallback(name, oldValue, newValue);
        }
    }

    static get styles() {
        return css`
        :host {
            font-family: Xolonium, sans-serif;
            display: block;
            margin-bottom: 2em;
        }
        a {
            text-decoration: none;
            color: #00bc8c;
            background-color: transparent;
        }

        a:hover {
            color: #007053;
            text-decoration: underline;
        }
        h1 {
            font-size: 1.4em;
        }

        code.server {
            user-select: all;
            font-family: "PT Mono", monospace;
            font-size: 0.89em;
        }

        .mapinfo {
            user-select: none;
        }

        span.map-name {
            user-select: all;
        }

        .metric-good {
            color: green;
        }

        .metric-fine {
            color: yellow;
        }

        .metric-bad {
            color: red;
        }
        .spectator {
            color: yellow;
        }

        .bot {
            color: red;
        }
        div.server-info {
            display: flex;
            flex-direction: row;
            justify-content: center;
            flex-wrap: wrap;
        }

        div.server-info > * {
            margin-bottom: 1em;
        }

        table.server-params {
            padding-left: 0;
            margin-left: 0;
            flex: 1 0 0;
            line-height: 1.15em;
            border-spacing: 0 0.175em;
            border-collapse: separate;
        }
        .server-params td {
            white-space: nowrap;
            padding-right: 0.8em;
        }
        table.players {
            margin-top: 1.3em;
            border-spacing: 0.75em 0.075em;
            border-collapse: separate;
            width: 100%;
        }
        .mapinfo thead {
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        xon-mapshot {
            max-height: 180px;
            max-width: 280px;
            margin: 0 auto;
            display: flex;
        }
        td.col-player, td.col-score {
            position: relative;
        }
        td.col-player:before, td.col-score:before {
            content: '&nbsp;';
            visibility: hidden;
        }

        td.col-player > span, td.col-score > span.spectator {
            position: absolute;
            left: 0;
            right: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        td.col-score > span.frags {
            position: absolute;
            left: 0;
            right: 0;
            white-space: nowrap;
        }
        col.col-player {
            width: 38%;
        }
        td.server-item {
            white-space: normal;
        }
        .col-slot, .col-ping {
            width: 8%;
            text-align: right;
        }
        .col-time {
            width: 15%;
            max-width: 8em;
        }
        .col-score {
            width: 18%;
        }
        @media screen and (max-width: 550px) {
            .col-pl {
                visibility: collapse;
                display: none;
                width: 0;
                height: 0;
            }
            :host {
                font-size: 0.9em;
            }
        }

        @media screen and (max-width: 440px) {
            :host {
                font-size: 0.8em;
            }

            .col-time {
                visibility: collapse;
                display: none;
                width: 0;
                height: 0;
            }
        }
        @media screen and (max-width: 340px) {
            :host {
                font-size: 0.76em;
            }
        }
        `
    }

    public loadData() {
        this.fetchUrl().then((data) => {
            this.serverStatus = data;
            this.loaded = true;
        });
    }

    private renderPlayers() {
        const players = this.serverStatus?.players;
        if (!this.loaded || !players) {
            return html``;
        }
        return html`
            <table class="players">
                <colgroup>
                    <col class="col-slot">
                    <col class="col-player">
                    <col class="col-ping">
                    <col class="col-pl">
                    <col class="col-time">
                    <col class="col-score">
                </colgroup>
                <thead>
                    <tr>
                        <th class="col-slot">Slot</th>
                        <th class="col-player">Player</th>
                        <th class="col-ping">Ping</th>
                        <th class="col-pl">Pl</th>
                        <th class="col-time">Time</th>
                        <th class="col-score">Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${players.map((player) => html`
                    <tr>
                        <td class="col-slot">${player.no}</td>
                        <td class="col-player">${dptextDOM(player.name)}</td>
                        <td class="col-ping">${player.is_bot ?
                            html`<span class="bot">bot</span>`:
                            player.ping}
                        </td>
                        <td class="col-pl">${player.pl}</td>
                        <td class="col-time">${player.time}</td>
                        <td class="col-score">${player.frags == -666 ?
                                html`<span class="spectator">spectator</span>`:
                                html`<span class="frags">${player.frags}</span>`}
                        </td>
                    </tr>`
                 )}
                </tbody>
            </table>
        `;
    }

    private renderPerformance() {
        const timing = this.serverStatus?.timing;
        const cpu = timing?.cpu;
        const offsetMax = timing?.offset_max;
        const offsetSdev = timing?.offset_sdev;
        const offsetAvg = timing?.offset_avg;
        const lost = timing?.lost;

        if (cpu === undefined || cpu === null) {
            return html``;
        }

        function metricClass(value: number, val1: number, val2: number) {
            let metricClass;
            if (value <= val1) {
                return "metric-good";
            } else if (value <= val2) {
                return "metric-fine";
            } else {
                return "metric-bad";
            }
        }

        let cpuClass;
        if (cpu <= 25) {
            cpuClass = "metric-good";
        } else if (cpu <= 68) {
            cpuClass = "metric-fine";
        } else {
            cpuClass = "metric-bad";
        }
        return html`
            <tr>
                <td>CPU Usage:</td><td><span class=${metricClass(cpu, 28, 68)}>${cpu} %</span></td>
            </tr>
            <tr>
                <td>Lost frames:</td><td><span class=${metricClass(lost, 0.5, 1.5)}>${lost} %</span></td>
            </tr>
            <tr>
                <td>Average offset:</td><td><span class=${metricClass(offsetAvg, 1.2, 2.8)}>${offsetAvg} ms</span></td>
            </tr>
            <tr>
                <td>Max offset:</td><td><span class=${metricClass(offsetMax, 4.4, 8.2)}>${offsetMax} ms</span></td>
            </tr>
            <tr>
                <td>Stddev offset:</td><td><span class=${metricClass(offsetSdev, 0.8, 1.2)}>${offsetAvg} ms</span></td>
            </tr>`;
    }

    public render() {
        if (!this.loaded) {
            return html`<p>Status</p>`;
        }
        const statsUrl = this.xonStatsUrl ?
            html` (<a href=${this.xonStatsUrl}>stats</a>)`:
            html``;
                //<li>Performance: ${this.renderPerformance()}</li>
        return html`
        <div class="status">
        <h1>${this.serverStatus?.host}</h1>
        <div class="server-info">
        <table class="server-params">
        <tbody>
            <tr>
                <td>Server:</td>
                <td class="server-item"><code class="server">${this.connectHost}</code> ${statsUrl}</td>
            </tr>
            <tr>
                    <td>Players:</td>
                    <td>${this.serverStatus?.players_count}/${this.serverStatus?.players_max}</td>
            </tr>
            <tr>
                <td>Public:</td>
                <td>${this.serverStatus?.sv_public === 1 ? html`Yes`: html`No`}</td>
            </tr>
            ${this.renderPerformance()}
        </tbody>
        </table>
        <table class="mapinfo">
            <thead>
                <tr><th>Map: <span class="map-name">${this.serverStatus.map}</span></th></tr>
            <thead>
            <tbody>
            <tr>
                <td>
                    <xon-mapshot map="${this.serverStatus.map}"></xon-mapshot>
                </td>
            </tr>
            </tbody>
        </table>
        </div>
        ${this.renderPlayers()}
        </div>`;
    }
}

class TemplateRouter {

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

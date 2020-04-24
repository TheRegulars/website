import { css, customElement, html, LitElement, property } from "lit-element";
import { MapshotComponent } from "./mapshot";


@customElement("xon-records")
export class RecordsComponent extends LitElement {

    private _dataUrl: string = "";
    private _mapshotsCache: {[key: string]: MapshotComponent | undefined} = {};
    private _tooltipTimeouts: {[key: string]: number | undefined} = {};
    private _tooltipTapStates: {[key: string]: boolean | undefined} = {};
    private _broadcastUpdateHandler = undefined;

    static get observedAttributes() {
        return super.observedAttributes.concat(["data-url"]);
    }

    static tooltipDelayTime: number = 260;

    @property({type: String})
    public get dataUrl() {
        return this._dataUrl;
    }

    public set dataUrl(value: string) {
        const oldValue = this.dataUrl;
        this._dataUrl = value;
        if (value != oldValue) {
            this.loadData();
            this.requestUpdate('dataUrl', oldValue);
        }
    }

    public attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === "data-url") {
            this.dataUrl = newValue;
        }
        super.attributeChangedCallback(name, oldValue, newValue);
    }

    static get styles() {
        return css`
            xon-mapshot {
                user-select: none;
                position: absolute;
                width: 100%;
                bottom: 100%;
                left: 50%;
                margin-left: -50%;
                pointer-events: none;
                z-index: 1;
                animation: mapshot 310ms ease-in none;
                background-color: #000;
                border: solid 1.8px #999;
                border-radius: 5px;
            }

            @keyframes mapshot {
                0% {
                    opacity: 0.1;
                    transform: scale(0) translate(-50%, 50%);
                }
                100% {
                    opacity: 1;
                    transform: scale(1) translate(0, 0);
                }
            }
            xon-mapshot[hidden] {
                display: none;
            }
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
                padding: 1px 2px 1px 0;
                margin: 1px;
                vertical-align: top;
                white-space: nowrap;
            }

            td.col-nick {
                overflow: hidden;
                text-overflow: ellipsis;
            }
            td.col-map > span {
                display: block;
                width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            td.col-nick {
                padding-left: 15px;
            }
            td.col-record {
                text-align: center;
            }

            td.col-map {
                position: relative;
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

            @media screen and (max-width: 550px) {
                div.record {
                    font-size: 0.8em;
                }
            }
            @media screen and (max-width: 460px) {
                div.record {
                    font-size: 0.72em;
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
    @property({type: Boolean}) public tooltips = true;

    constructor() {
        super();
        this.setCurrentPage();
        this._broadcastUpdateHandler = (async (event) => {
            if (event.data.meta === "workbox-broadcast-update") {
                const {cacheName, updateUrl} = event.data.payload;
                if (updateUrl === this.dataUrl) {
                    const cache = await caches.open(cacheName);
                    const updatedResponse = await cache.match(updateUrl);
                    const updatedData = await updatedResponse.json();
                    this.recordsReceived(updatedData);
                }
            }
        }).bind(this);

        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.addEventListener("message", this._broadcastUpdateHandler);
        }
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

    private recordsReceived(data) {
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
    }

    public disconnectedCallback() {
        window.removeEventListener("hashchange", this.hashChangeHandler);
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.removeEventListener("message", this._broadcastUpdateHandler);
        }
        super.disconnectedCallback();
    }

    public hashChange(event: HashChangeEvent) {
        this.setCurrentPage();
    }

    public loadData() {
        fetch(this.dataUrl).then((resp) => {
            if (!resp.ok) {
                throw Error(resp.statusText);
            }
            return resp.json();
        }).then((data) => {
            this.recordsReceived(data);
        }).catch((err) => {
            console.log(err);
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

    private handleMapMouseenter(evt) {
        const map = evt?.target?.attributes?.map?.value;
        if (map && !this._tooltipTapStates[map]) {
            this._tooltipTapStates[map] = true;
            this.scheduleEnableTooltip(map);
        }
    }

    private handleMapMouseleave(evt) {
        const map = evt?.target?.attributes?.map?.value;
        if (map) {
            this._tooltipTapStates[map] = false;
            this.disableTooltip(map)
        }
    }

    private handleTouchStart(evt) {
        // handle double tap on phone to hide tooltip
        if (evt.path && evt.path.find) {
            const elem = evt.path.find(dom => dom.tagName == "TD");
            const map = elem?.attributes?.map?.value;
            if (map) {
                if (this._tooltipTapStates[map]) {
                    this._tooltipTapStates[map] = false;
                    this.disableTooltip(map)
                } else {
                    this._tooltipTapStates[map] = true;
                    this.enableTooltip(map)
                }
            }
        }
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

    private scheduleEnableTooltip(map: string) {
        const timeoutId = setTimeout(() => {
            this.enableTooltip(map)
        }, RecordsComponent.tooltipDelayTime);
        this._tooltipTimeouts[map] = timeoutId;
    }

    private enableTooltip(map: string) {
        let elem = this._mapshotsCache[map];
        if (elem === undefined) {
            // create new mapshoot
            elem = new MapshotComponent();
            elem.map = map;
            this._mapshotsCache[map] = elem;
            this.requestUpdate();
        } else {
            elem.hidden = false;
        }
    }

    private disableTooltip(map: string) {
        const timeoutId = this._tooltipTimeouts[map]
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
        let elem = this._mapshotsCache[map];
        if (elem !== undefined) {
            elem.hidden = true;
        }
    }

    public renderMap(map: string) {
        if (!this.tooltips) {
            return html`<td class="col-map">${map}</td>`;
        } else {
            const elem = this._mapshotsCache[map];
            return html`
            <td class="col-map"
                @mouseenter=${this.handleMapMouseenter}
                @mouseleave=${this.handleMapMouseleave}
                @touchstart=${this.handleTouchStart} map=${map}>
                <span>${map}</span>${elem}
            </td>
            `;
        }
    }

    public render() {
        if (!this.loaded) {
            return html`<span>Loading records...</span>`;
        } else {
            return html`
            <div class="record">
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
                    ${this.renderMap(item.map)}
                    <td class="col-record">${item.value.toFixed(3)}</td>
                    <td class="col-nick"><xon-text text=${item.player}></xon-text></td>
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

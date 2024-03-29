import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

interface RecordItem {
    map: string;
    player: string;
    value: number;
}

interface RecordsApi {
    [map: string]: {
        name: string;
        val: number;
    };
}

@customElement("xon-records")
export class RecordsComponent extends LitElement {

    // private static tooltipDelayTime: number = 260;
    public static pageRegexp = /^#?page-(\d+)$/i;

    @property({type: Boolean}) public loaded = false;
    @property({type: Array}) public records: RecordItem[] = [];
    @property({type: Number}) public pageBy = 50;
    @property({type: Number}) public currentPage = 1;
    @property({type: Boolean}) public tooltips = true;

    private _dataUrl: string = "";
    private _broadcastUpdateHandler: (evt: MessageEvent) => Promise<void>;
    private hashChangeHandler: (evt: HashChangeEvent) => void;

    constructor() {
        /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment,
        @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-misused-promises
        */
        super();
        this.setCurrentPage();
        this._broadcastUpdateHandler = (async (event: MessageEvent) => {
            if (event.data?.meta === "workbox-broadcast-update") {
                const {cacheName, updateUrl} = event.data.payload;
                if (updateUrl === this.dataUrl) {
                    const cache = await caches.open(cacheName);
                    const updatedResponse = await cache.match(updateUrl);
                    if (updatedResponse) {
                        const updatedData = await updatedResponse.json();
                        this.recordsReceived(updatedData);
                    }
                }
            }
        }).bind(this);

        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.addEventListener("message", this._broadcastUpdateHandler);
        }
        /* eslint-enable */
        this.hashChangeHandler = this.hashChange.bind(this);
    }

    public static get observedAttributes() {
        return super.observedAttributes.concat(["data-url"]);
    }

    public static get styles() {
        return css`
            * {
                padding: 0;
                margin: 0;
            }
            xon-mapshot-tooltip {
                width: 100%;
                height: 100%;
                display: inline-flex;
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

    public get pages(): number {
        if (!this.loaded || this.pageBy <= 0) {
            return 1;
        }
        return Math.ceil(this.records.length / this.pageBy);
    }

    @property({type: String})
    public get dataUrl() {
        return this._dataUrl;
    }

    public set dataUrl(value: string) {
        const oldValue = this.dataUrl;
        this._dataUrl = value;
        if (value !== oldValue) {
            this.loadData();
            this.requestUpdate("dataUrl", oldValue);
        }
    }

    public attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === "data-url") {
            this.dataUrl = newValue;
        }
        super.attributeChangedCallback(name, oldValue, newValue);
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
        window.addEventListener("hashchange", this.hashChangeHandler);
    }

    public disconnectedCallback() {
        window.removeEventListener("hashchange", this.hashChangeHandler);
        /* eslint-disable @typescript-eslint/no-misused-promises */
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.removeEventListener("message", this._broadcastUpdateHandler);
        }
        /* eslint-enable */
        super.disconnectedCallback();
    }

    public hashChange(_event: HashChangeEvent) {
        this.setCurrentPage();
    }

    public loadData() {
        fetch(this.dataUrl).then((resp) => {
            if (!resp.ok) {
                throw Error(resp.statusText);
            }
            return resp.json();
        }).then((data: RecordsApi) => {
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
        const elem = event?.target as HTMLElement;
        if (!elem) {
            return true;
        }
        const newPage = parseInt(elem.getAttribute("switch-page") || "", 10);
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
                    <td class="col-map"><xon-mapshot-tooltip map="${item.map}"></xon-mapshot-tooltip></td>
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

    private recordsReceived(data: RecordsApi) {
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
}

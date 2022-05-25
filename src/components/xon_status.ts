import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

interface XonTiming {
    cpu: number;
    lost: number;
    offset_avg: number;
    offset_max: number;
    offset_sdev: number;
}

interface XonPlayer {
    no: number;
    ping: number;
    pl: number;
    time: string;
    frags: number;
    name: string;
    is_bot: boolean;
}

interface XonServerStatus {
    sv_public: number;
    host: string;
    version: string;
    protocol: string;
    map: string;
    timing: XonTiming;
    players_count: number;
    players_max: number;
    players:  XonPlayer[];
}

function getConnection(): NetworkInformation | undefined {
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection;
}


@customElement("xon-status")
export class StatusComponent extends LitElement {

    private static goodConnectionRefreshInterval: number = 20;
    private static badConnectionRefreshInterval: number = 120;

    @property({type: Object}) public serverStatus: XonServerStatus | undefined = undefined;
    @property({type: String}) public connectHost: string = "";
    @property({type: String}) public xonStatsUrl: string = "";
    @property({type: Object}) public lastRequestedDate: Date | undefined;
    @property({type: Object}) public lastLoadedDate: Date | undefined;

    private _connectionHandler: (evt: Event) => void;
    private _visibilityHandler: (evt: Event) => void;
    private _loaded = false;
    private _autorefresh: boolean = true;
    private _dataUrl: string = "";
    private _timerId: number | undefined = undefined;

    constructor() {
        super();
        this._visibilityHandler = this.visiblityChanged.bind(this);
        this._connectionHandler = this.connectionChanged.bind(this);
    }

    public static get observedAttributes() {
        return super.observedAttributes.concat(["data-url", "connect-host", "xon-stats-url"]);
    }

    public static get styles() {
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
            justify-content: flex-start;
            flex-wrap: wrap;
            row-gap: 0.9em;
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
			border-spacing: 0;
            border-collapse: separate;
            width: 100%;
        }
        div.mapinfo {
            margin-left: auto;
            margin-right: auto;
        }
        div.mapinfo > div {
            margin-left: auto;
            margin-right: auto;
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            padding: 0.15rem 0;
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

        td.col-player > xon-text, td.col-score > span.spectator {
            position: absolute;
            left: 0;
            right: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1em;
        }
        td.col-score > span.frags {
            position: absolute;
            left: 0;
            right: 0;
            white-space: nowrap;
        }
        col.col-player {
            width: 45%;
        }
        td.server-item {
            white-space: normal;
        }
        .col-slot, .col-ping {
            text-align: right;
			      padding-right: 10px;
        }
        .col-ping {
            width: 8%;
        }
        .col-slot, .col-pl {
            width: 6%;
        }
        .col-time {
            width: 15%;
			padding-right: 2px;
			padding-left: 2px;
        }
        .col-score {
            width: 18%;
        }
		.players tbody > tr:hover {
			background-color: rgba(255, 255, 255, 0.1);
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
                font-size: 0.72em;
            }
            .col-slot {
                visibility: collapse;
                display: none;
                width: 0;
                height: 0;
            }
        }
        `;
    }

    @property({type: Number})
    public get refreshInterval() {
        const connection = getConnection();

        if (!connection) {
            return StatusComponent.goodConnectionRefreshInterval;
        } else if (connection.saveData || connection.effectiveType === "slow-2g" ||
                   connection.effectiveType === "2g" || connection.effectiveType === "3g" ||
                   (connection.downlink && connection.downlink < 0.5)) {
            return StatusComponent.badConnectionRefreshInterval;
        } else {
            return StatusComponent.goodConnectionRefreshInterval;
        }
    }
    @property({type: Boolean})
    public get loaded() {
        return this._loaded;
    }

    @property({type: Boolean})
    public get visible() {
        if (typeof document.visibilityState !== "undefined") {
            return document.visibilityState !== "hidden";
        } else {
            return true;
        }
    }

    @property({type: Boolean})
    public get autoRefresh() {
        return this._autorefresh;
    }

    @property({type: String})
    public get dataUrl() {
        return this._dataUrl;
    }

    public set dataUrl(value: string) {
        const oldValue = this.dataUrl;
        this._dataUrl = value;
        this.setLoaded(false);
        if (value) {
            this.loadData();
        }
        this.requestUpdate("dataUrl", oldValue);
    }

    public connectedCallback() {
        super.connectedCallback();
        const connection = getConnection();

        // listen for connection changes
        if (connection && connection.addEventListener) {
            connection.addEventListener("change", this._connectionHandler);
        }

        // listen for visiblity changes
        if (typeof document.hidden !== "undefined") {
            document.addEventListener("visibilitychange", this._visibilityHandler);
        }

        // enable auto refresh if tab is visible
        if (this.visible && navigator.onLine !== false) {
            this.enableAutoRefresh();
        }
    }

    public disconnectedCallback() {
        super.disconnectedCallback();
        const connection = getConnection();
        if (connection && (connection.addEventListener as any)) {
            connection.removeEventListener("change", this._connectionHandler);
        }
        if (this._visibilityHandler) {
            document.removeEventListener("visibilitychange", this._visibilityHandler);
        }
        // disable auto refresh if it was enabled
        this.disableAutoRefresh();
    }

    public loadData() {
        this.lastRequestedDate = new Date();
        fetch(this.dataUrl).then((resp) => {
            if (!resp.ok) {
                throw Error(resp.statusText);
            }
            return resp.json();
        }).then((data: XonServerStatus) => {
            this.serverStatus = data;
            this.setLoaded(true);
            this.lastLoadedDate = new Date();
        }).catch((err) => {
            console.log("Failed to load data", err);
        });
    }

    public reloadData() {
        this.loadData();
    }

    public attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === "data-url") {
            this.dataUrl = newValue;
        } else if (name === "connect-host") {
            this.connectHost = newValue;
        } else if (name === "xon-stats-url") {
            this.xonStatsUrl = newValue;
        }
        super.attributeChangedCallback(name, oldValue, newValue);
    }

    public render() {
        if (!this.loaded || !this.serverStatus) {
            return html`<p>Status</p>`;
        }
        const statsUrl = this.xonStatsUrl ? html` (<a href=${this.xonStatsUrl}>stats</a>)`: html``;
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
        <div class="mapinfo">
            <div>
                Map: <span class="map-name">${this.serverStatus?.map}</span>
            </div>
            <xon-mapshot map="${this.serverStatus.map}"></xon-mapshot>
        </div>
        </div>
        ${this.renderPlayers()}
        </div>`;
    }

    private setLoaded(val: boolean) {
        const oldVal = this.loaded;
        if (oldVal !== val) {
            this._loaded = val;
            this.requestUpdate("loaded", oldVal);
        }
    }

    private enableAutoRefresh() {
        this._autorefresh = true;
        this._timerId = window.setInterval(this.reloadData.bind(this), this.refreshInterval * 1000);
    }

    private disableAutoRefresh() {
        if (this._timerId !== undefined) {
            window.clearInterval(this._timerId);
        }
        this._autorefresh = false;
    }
    private updateAutoRefresh() {
        if (!this.visible || navigator.onLine === false) {
            this.disableAutoRefresh();
        } else {
            if (this.autoRefresh) {
                this.disableAutoRefresh();
                this.enableAutoRefresh();
            } else {
                this.enableAutoRefresh();
            }
            if (this.lastRequestedDate) {
                const currentDate = new Date();
                const diff = currentDate.getTime() - this.lastRequestedDate.getTime();
                if (diff > (this.refreshInterval * 1000)) {
                    // request early update
                    this.reloadData();
                }
            }
        }
    }
    // called when internet connection have changed
    private connectionChanged(_evt: Event) {
        this.updateAutoRefresh();
    }

    private visiblityChanged(_evt: Event) {
        this.updateAutoRefresh();
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
                        <td class="col-player"><xon-text text=${player.name}></xon-text></td>
                        <td class="col-ping">${player.is_bot ?
        html`<span class="bot">bot</span>`:
        player.ping}
                        </td>
                        <td class="col-pl">${player.pl}</td>
                        <td class="col-time">${player.time}</td>
                        <td class="col-score">${player.frags === -666 ?
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
        if (!this.serverStatus || !this.serverStatus.timing) {
            return html``;
        }
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
            if (value <= val1) {
                return "metric-good";
            } else if (value <= val2) {
                return "metric-fine";
            } else {
                return "metric-bad";
            }
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
}

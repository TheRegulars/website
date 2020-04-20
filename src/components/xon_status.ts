import { css, customElement, html, LitElement, property } from "lit-element";
import { dptextDOM } from "../dptext";


@customElement("xon-status")
export class StatusComponents extends LitElement {

    @property({type: Object}) public serverStatus = {};
    @property({type: Number}) public reloadInterval: number = 20;
    @property({type: String}) public connectHost: string = "";
    @property({type: String}) public xonStatsUrl: string = "";
    @property({type: Boolean}) public loaded = false;

    static get observedAttributes() {
        return super.observedAttributes.concat(["data-url", "reload-interval", 'connect-host', 'xon-stats-url']);
    }

    public attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === "data-url") {
            this.url = newValue;
        } else if (name === "reload-interval") {
            this.reloadInterval = parseInt(newValue, 10);
        } else if (name === "connect-host") {
            this.connectHost = newValue;
        } else if (name === "xon-stats-url") {
            this.xonStatsUrl = newValue;
        } else {
            super.attributeChangedCallback(name, oldValue, newValue);
        }
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

    public reloadData() {
        this.loadData();
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

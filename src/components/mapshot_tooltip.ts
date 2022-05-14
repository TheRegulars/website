import { customElement, html, LitElement, property, css } from "lit-element";
import { MapshotComponent } from "./mapshot";

@customElement("xon-mapshot-tooltip")
export class MapshotTooltipComponent extends LitElement {
    private _mapshotCache:  MapshotComponent | undefined = undefined;
    private _map: string = "";
    private _timeoutId: number | undefined = undefined;
    private _hidden: boolean = true;
    private _focused: boolean = false;

    constructor() {
        super();
        // TODO: get rid from bind
        this.handleLoad = this.handleLoad.bind(this);
    }

    public static get styles() {
        return css`
            :host {
                display: inline-block;
            }
            * {
                margin: 0;
                padding: 0;
            }
            div {
                position: relative;
                display: inline-flex;
            }
            div, div > span {
                width: 100%;
                height: 100%;
            }
            div > span {
                overflow: hidden;
                display: inline-block;
                flex-grow: 1;
                text-overflow: ellipsis;
            }
            xon-mapshot {
                user-select: none;
                position: absolute;
                width: 100%;
                bottom: 100%;
                left: 50%;
                margin-left: -50%;
                pointer-events: none;
                z-index: 10;
                animation: mapshot 220ms ease-out none;
                transition: transform 220ms ease-out;
                background-color: #000;
                border: solid 1.8px #999;
                border-radius: 5px;
                transform-origin: bottom;
                transform: scale(1, 1);
                box-shadow: 0 5px 25px 0 rgba(0, 0, 0, 0.5);
            }
            xon-mapshot[hidden] {
                transform: scale(0, 0);
                transition: transform 180ms ease-out;
            }
            @keyframes mapshot {
                0% {
                    transform: scale(0, 0);
                }
                100% {
                    transform: scale(1, 1);
                }
            }
        `;
    }

    @property({type: String, hasChanged: (newVal: string, oldVal: string) => {
        return newVal.toLowerCase() !== oldVal.toLowerCase();
    }})
    public get map(): string {
        return this._map;
    }
    public set map(value: string) {
        const oldValue = this.map;
        if (this._mapshotCache && oldValue.toLocaleUpperCase() !== value.toLowerCase()) {
            this._mapshotCache.removeEventListener("load", this.handleLoad);
            this._mapshotCache = undefined;
        }
        this._map = value;
        this.requestUpdate("map", oldValue);
    }

    public delayedShowMapshot(timeout: number = 260) {
        this._hidden = false;
        this._timeoutId = window.setTimeout(() => {
            this.showMapshot();
        }, timeout);
    }

    public showMapshot() {
        this._hidden = false;
        if (!this._mapshotCache) {
            const elem = new MapshotComponent();
            elem.map = this.map;
            elem.addEventListener("load", this.handleLoad);
            this._mapshotCache = elem;
        }
        this._mapshotCache.hidden = false;
        this.requestUpdate();
    }

    public hideMapshot() {
        this._hidden = true;
        if (this._timeoutId !== undefined) {
            window.clearTimeout(this._timeoutId);
        }
        if (this._mapshotCache) {
            this._mapshotCache.hidden = true;
        }
        this.requestUpdate();
    }

    public render() {
        const mapshot = (this._mapshotCache && this._mapshotCache.loaded) ?
            this._mapshotCache : html``;
        return html`
        <div><span @mouseenter=${this.handleMouseEnter} @mouseleave=${this.handleMouseLeave}
        @touchstart=${this.handleTouchStart}> ${this.map}</span>${mapshot}</div>`;
    }
    private handleLoad = (_evt: Event) => {
        if (this._mapshotCache) {
            this.requestUpdate();
        }
    };

    private handleMouseEnter = (_evt: MouseEvent) => {
        this._focused = true;
        this.delayedShowMapshot();
    };

    private handleMouseLeave = (_evt: MouseEvent) => {
        this.hideMapshot();
        this._focused = false;
    };

    private handleTouchStart = (_evt: TouchEvent) => {
        if (!this._focused) {
            return;
        }
        if (!this._hidden) {
            this.hideMapshot();
        } else {
            this.showMapshot();
        }
    };
}

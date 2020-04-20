import { css, customElement, html, LitElement, property } from "lit-element";

@customElement("xon-mapshot")
export class MapshotComponent extends LitElement {
    public static mapshotApi: string = "https://dl.regulars.win/mapshots/";
    public static missingMapshot: string = "/images/nopreview_map.png";
    @property ({type: Boolean}) public loaded = false;
    private imgDOM: Image | undefined = undefined;

    private _map: string;

    @property({type: String, hasChanged: (newVal, oldVal) => {
        return newVal.toLowerCase() !== oldVal.toLowerCase();
    }})
    public get map(): string {
        return (!this._map) ? "" : this._map;
    }

    public set map(value: string) {
        const oldValue = this.map;
        this._map = value.toLowerCase();
        this.requestUpdate('map', oldValue);
    }

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
        return `${MapshotComponent.mapshotApi}${this.map}.${ext}`;
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

    public attributeChangedCallback(name, oldVal, newVal) {
        if (name === "map") {
            this.loaded = false;
        }
        super.attributeChangedCallback(name, oldVal, newVal);
    }

    public updated(changedProperties) {
        if (!this.loaded) {
            this.loadImage();
        }
        super.updated(changedProperties);
    }

    public render() {
        if (!this.loaded) {
            return html`<div>loading...</div>`;
        } else {
            return html`${this.imgDOM}`;
        }
    }
}


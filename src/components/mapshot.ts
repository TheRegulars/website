import { css, customElement, html, LitElement, property } from "lit-element";

@customElement("xon-mapshot")
export class MapshotComponent extends LitElement {
    public static mapshotApi: string = MAPSHOT_BASE_URL || "";
    public static missingMapshot: string = "/images/nopreview_map.png";
    @property ({type: Boolean}) public loaded = false;
    private imgDOM: HTMLImageElement | undefined = undefined;

    private _map: string = "";

    @property({type: String, hasChanged: (newVal: string, oldVal: string) => {
        return newVal.toLowerCase() !== oldVal.toLowerCase();
    }})
    public get map(): string {
        return (!this._map) ? "" : this._map;
    }

    public set map(value: string) {
        const oldValue = this.map;
        this._map = value.toLowerCase();
        if (oldValue.toLowerCase() !== value.toLowerCase()) {
            this.loaded = false;
            // load image eagerly
            this.loadImage();
        }
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

    private imageLoaded(img: HTMLImageElement, missing: boolean) {
        img.alt = this.map;
        this.imgDOM = img;
        this.loaded = true;
        const event = new CustomEvent("load", {
            bubbles: false,
            cancelable: false,
            detail: {
                missing: missing
            }
        });
        this.requestUpdate();
        this.dispatchEvent(event);
    }

    private loadImage() {
        if (!this.map) {
            return;
        }
        let pngImg = new Image(); 
        let jpgImg = new Image();
        let missingImg = new Image();
        pngImg.src = this.mapshotURL("png");
        jpgImg.src = this.mapshotURL("jpg");
        missingImg.src = MapshotComponent.missingMapshot;
        let pngPromise: Promise<HTMLImageElement> = new Promise((resolve, reject) => {
            pngImg.onload = (() => resolve(pngImg));
            pngImg.onerror = pngImg.onabort = ((evt: string | Event) => reject(evt));
        });
        let jpgPromise: Promise<HTMLImageElement> = new Promise((resolve, reject) => {
            jpgImg.onload = (() => resolve(jpgImg));
            jpgImg.onerror = jpgImg.onabort = ((evt: string | Event) => reject(evt));
        });
        pngPromise.then((img) => {
            // cancel jpg loading
            jpgImg.src = "";
            this.imageLoaded(img, false);
            jpgPromise.catch(() => {}); // ignore jpg
        }).catch(() => {
            jpgPromise.then((img) => {
                this.imageLoaded(img, false);
            }).catch(() => {
                this.imageLoaded(missingImg, true);
            });
        });
    }

    public render() {
        if (!this.loaded) {
            return html`<div>loading...</div>`;
        } else {
            return html`${this.imgDOM}`;
        }
    }
}


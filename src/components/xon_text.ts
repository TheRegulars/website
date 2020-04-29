import { customElement, LitElement, property } from "lit-element";
import { dptextDOM } from "../dptext";

@customElement("xon-text")
export class XonTextComponent extends LitElement {
    @property ({type: String}) public text = "";

    public render() {
        return dptextDOM(this.text);
    }
}

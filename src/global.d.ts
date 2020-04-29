declare const MAPSHOT_BASE_URL: string | undefined;

interface NetworkEventMap  {
    "change": Event;
}

interface NetworkInformation {
    readonly downlink: number | undefined;
    readonly donwlinkMax: number | undefined;
    readonly effectiveType: string | undefined; // TODO: specify possible vals
    readonly rtt: number | undefined; // TODO: specify possible vals
    readonly saveData: boolean | undefined;
    readonly type: string | undefined;
    addEventListener<K extends keyof NetworkEventMap>(type: K, listener: (this: NetworkInformation, ev: NetworkEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof NetworkEventMap>(type: K, listener: (this: NetworkInformation, ev: NetworkEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
};

interface Navigator {
    readonly connection: NetworkInformation | undefined;
    readonly mozConnection: NetworkInformation | undefined;
    readonly webkitConnection: NetworkInformation | undefined;
}

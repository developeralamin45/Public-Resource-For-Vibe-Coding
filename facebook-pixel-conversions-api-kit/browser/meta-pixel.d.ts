// Types for meta-pixel.js (window.MetaPixel).

export type PurchasePolicy = 'on_order' | 'on_payment' | 'on_confirm';

export type StandardEvent =
    | 'PageView' | 'ViewContent' | 'Search' | 'AddToCart' | 'AddToWishlist'
    | 'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase' | 'Lead'
    | 'CompleteRegistration' | 'Contact' | 'CustomizeProduct' | 'Donate'
    | 'FindLocation' | 'Schedule' | 'StartTrial' | 'SubmitApplication' | 'Subscribe';

export interface MetaPixelOptions {
    /** The public Pixel / Dataset ID. Empty → everything is a no-op. */
    pixelId: string;
    /** Default 'on_confirm' — the one that can never report a sale that did not happen. */
    purchasePolicy?: PurchasePolicy;
    /** POST endpoint for the server (Conversions API) copy. Omit for browser-only. */
    relayUrl?: string;
    /** Return false inside a native app WebView, on admin pages, or without consent. */
    enabled?: () => boolean;
    /** Defer fbevents.js until first interaction / 2.5 s after load. Default true. */
    lazy?: boolean;
    /** Fire PageView on init. Default true. */
    autoPageView?: boolean;
    /** Country code for phone matching. Default '880'. */
    phoneCountryCode?: string;
    debug?: boolean;
    /** Test seam: load a stub instead of Meta's fbevents.js. */
    scriptUrl?: string;
}

/** Meta's standard parameters. Purchase requires `value` and `currency`. */
export interface EventParams {
    value?: number;
    currency?: string;
    content_ids?: string[];
    content_type?: 'product' | 'product_group' | string;
    content_name?: string;
    content_category?: string;
    contents?: Array<{ id: string; quantity: number; item_price?: number }>;
    num_items?: number;
    search_string?: string;
    status?: string | boolean;
    predicted_ltv?: number;
    [key: string]: unknown;
}

export interface TrackOptions {
    /** Share an id with a server-sent copy of the same event. */
    eventId?: string;
    /** Hashed in the browser before it leaves; used only for matching. */
    user?: { phone?: string; email?: string };
}

/** Send this with every order / lead / registration; the server stores it. */
export interface Attribution { fbp: string | null; fbc: string | null; url: string }

type Helper = (params?: EventParams, opts?: TrackOptions) => string | null;

export interface MetaPixelApi {
    init(options: MetaPixelOptions): boolean;
    /** Once per path — call on every route change in an SPA. */
    pageView(): string | null;
    track(name: StandardEvent, params?: EventParams, opts?: TrackOptions): string | null;
    trackCustom(name: string, params?: EventParams, opts?: TrackOptions): string | null;
    /** Browser copy of a Purchase: refused under on_confirm, and without the server-issued id. */
    purchase(params: EventParams, eventId: string, opts?: { policy?: PurchasePolicy }): string | null;
    /** Purchase where the browser may fire it, AddPaymentInfo where it may not. */
    orderSubmitted(params: EventParams, opts?: TrackOptions & { purchaseEventId?: string | null; policy?: PurchasePolicy }): string | null;
    attribution(): Attribution;
    newEventId(): string;
    normalizePhone(phone: string, countryCode?: string): string;
    STANDARD_EVENTS: StandardEvent[];

    viewContent: Helper; search: Helper; addToCart: Helper; addToWishlist: Helper;
    initiateCheckout: Helper; addPaymentInfo: Helper; lead: Helper;
    completeRegistration: Helper; contact: Helper; customizeProduct: Helper;
    donate: Helper; findLocation: Helper; schedule: Helper; startTrial: Helper;
    submitApplication: Helper; subscribe: Helper;
}

declare global {
    interface Window { MetaPixel: MetaPixelApi; fbq?: (...args: unknown[]) => void; _fbq?: unknown }
}

declare const MetaPixel: MetaPixelApi;
export default MetaPixel;

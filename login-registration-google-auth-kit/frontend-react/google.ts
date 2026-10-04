/**
 * "Continue with Google" for a React / SPA frontend.
 *
 * Google Identity Services, token flow: a popup, an access token, and the
 * backend verifies that token with Google (App\Support\GoogleToken). The
 * browser never proves identity by itself.
 *
 *     if (googleOffered(clientId)) render the button + its "or" divider
 *     const token = await requestGoogleToken(clientId);
 *     const res = await api.post('/auth/google', { access_token: token });
 *     res.needs_registration → show the phone step, then
 *     api.post('/auth/google/register', { google_token: res.google_token, phone })
 *
 * The client id is passed in rather than read here, so it can come from
 * wherever the project keeps it: a build-time env var, or — better — the
 * settings endpoint the admin panel writes to.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/**
 * What an embedded browser calls itself. Keep in step with
 * App\Support\GoogleAuth::EMBEDDED_BROWSER_MARKERS.
 */
const EMBEDDED_BROWSER_MARKERS = [
    'FBAN', 'FBAV', 'FB_IAB', 'FB4A', 'FBIOS', 'Instagram', 'Line/',
    'MicroMessenger', 'musical_ly', 'TikTok', 'BytedanceWebview', 'Snapchat', '; wv)',
];

/**
 * Facebook's, Instagram's and other apps' own browsers. Google refuses to sign
 * anyone in from one ("disallowed_useragent"), and it cannot be
 * feature-detected — nothing the page can query says "Google will refuse me" —
 * so the hosts are named.
 */
export function isEmbeddedBrowser(userAgent: string = navigator.userAgent): boolean {
    const ua = userAgent.toLowerCase();
    return EMBEDDED_BROWSER_MARKERS.some((m) => ua.includes(m.toLowerCase()));
}

/**
 * A native app that wraps this site in a WebView can still offer Google, by
 * handing sign-in to the phone's own account picker. The app injects a bridge
 * and answers with a Google ID token; see RECIPE.md, "Inside your own app".
 * Return the token, or throw an Error whose message can be shown.
 */
export type NativeGoogleBridge = (clientId: string) => Promise<string>;

/**
 * Should the button — and the divider under it — be shown at all?
 *
 * A button that is guaranteed to fail is worse than no button: the visitor
 * taps, gets a Google error page, and blames the site. So: no client id, no
 * button; an embedded browser with no native bridge, no button.
 */
export function googleOffered(clientId: string | null | undefined, native?: NativeGoogleBridge | null): boolean {
    if (!clientId) return false;
    if (native) return true;
    return !isEmbeddedBrowser();
}

let scriptPromise: Promise<void> | null = null;

/**
 * Loads Google's script once. Call it early (on mount, on pointerdown) as well
 * as from the click: a popup may only open while the browser still counts the
 * tap as "just happened", and a click that first has to download a script can
 * outlive that on a slow connection.
 */
export function loadGoogleScript(): Promise<void> {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise<void>((resolve, reject) => {
        if ((window as any).google?.accounts?.oauth2) return resolve();
        const s = document.createElement('script');
        s.src = GIS_SRC;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => {
            // Forget the failure, or one dropped request breaks the button
            // until the page is reloaded.
            scriptPromise = null;
            s.remove();
            reject(new Error('Could not load the Google script'));
        };
        document.head.appendChild(s);
    });
    return scriptPromise;
}

/** Thrown when the visitor simply closed the popup — a decision, not an error. */
export class GoogleSignInCancelled extends Error {
    constructor() {
        super('Google sign-in was cancelled.');
        this.name = 'GoogleSignInCancelled';
    }
}

/**
 * Opens the account chooser and resolves with a token for the backend: an
 * access token from the web popup, or an ID token from a native bridge. The
 * backend accepts both through the same field.
 */
export async function requestGoogleToken(clientId: string, native?: NativeGoogleBridge | null): Promise<string> {
    if (!clientId) throw new Error('Google login is not configured yet.');
    if (native) return native(clientId);

    await loadGoogleScript();

    return new Promise<string>((resolve, reject) => {
        try {
            const client = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'openid email profile',
                callback: (resp: any) => {
                    if (resp?.access_token) resolve(resp.access_token);
                    else reject(new Error('No token received from Google.'));
                },
                error_callback: (err: any) => {
                    if (err?.type === 'popup_failed_to_open') {
                        reject(new Error('The Google window was blocked. Allow pop-ups for this site and try again.'));
                    } else {
                        reject(new GoogleSignInCancelled());
                    }
                },
            });
            client.requestAccessToken();
        } catch (e) {
            reject(e);
        }
    });
}

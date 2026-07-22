/**
 * Google Identity Services (GIS) helper — "Continue with Google".
 *
 * Loads the GIS script once and returns a Google OAuth **access token** via the
 * implicit token flow (a popup account chooser — no redirect, no page reload).
 * The token is then sent to YOUR backend, which verifies it with Google and
 * logs the user in (see the Laravel controller in this kit).
 *
 * Client ID resolution order:
 *   1. the `clientId` argument you pass, else
 *   2. `import.meta.env.VITE_GOOGLE_CLIENT_ID` (Vite), else
 *   3. `window.__GOOGLE_CLIENT_ID__` (set it in index.html for non-Vite apps).
 */

const GIS_SRC = "https://accounts.google.com/gsi/client";

function resolveClientId(clientId?: string): string | undefined {
  if (clientId) return clientId;
  // Vite
  const viteId = (import.meta as any)?.env?.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (viteId) return viteId;
  // Fallback for non-Vite bundlers
  return (typeof window !== "undefined" && (window as any).__GOOGLE_CLIENT_ID__) || undefined;
}

let scriptPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load the Google script"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** True when a Google Client ID is available (hide the button otherwise). */
export const googleConfigured = (clientId?: string) => !!resolveClientId(clientId);

/**
 * Open the Google account chooser and resolve with an OAuth access token.
 * Rejects if the popup is dismissed or no Client ID is configured.
 */
export async function signInWithGoogle(clientId?: string): Promise<string> {
  const id = resolveClientId(clientId);
  if (!id) throw new Error("Google Client ID is not set (VITE_GOOGLE_CLIENT_ID).");
  await loadGis();

  return new Promise<string>((resolve, reject) => {
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: "openid email profile",
        callback: (resp: any) => {
          if (resp?.access_token) resolve(resp.access_token);
          else reject(new Error("No token received from Google"));
        },
        error_callback: () => reject(new Error("Google sign-in was cancelled")),
      });
      client.requestAccessToken();
    } catch (e) {
      reject(e);
    }
  });
}

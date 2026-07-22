import { useState, type ReactNode } from "react";
import { signInWithGoogle, googleConfigured } from "./google";

/**
 * GoogleButton — a drop-in "Continue with Google" button that runs the whole
 * step-1 flow: open Google → get an access token → POST it to your backend →
 * route the result.
 *
 * Your backend's `/auth/google` should return either:
 *   • `{ login: true, ... }`            → existing user; call `onLogin(data)`.
 *   • `{ needs_registration: true, name, email, picture, google_token }`
 *                                        → new user; call `onNeedsRegistration(data)`
 *                                          and collect any extra fields, then POST
 *                                          to `/auth/google/register`.
 * (See the Laravel controller + RECIPE.md in this kit.)
 *
 * Backend-agnostic: pass an axios-compatible `http` client. Zero UI deps — the
 * Google logo is inline SVG; render your own spinner via the `spinner` prop.
 */

export interface HttpClient {
  post: (url: string, body: any) => Promise<{ data: any }>;
}

export interface GoogleButtonProps {
  http: HttpClient;
  onLogin: (data: any) => void;
  onNeedsRegistration: (data: any) => void;
  onError?: (message: string) => void;
  /** Endpoint that verifies the token + logs in / signals registration. */
  endpoint?: string;
  /** Optional explicit Client ID (else read from env — see google.ts). */
  clientId?: string;
  label?: string;
  className?: string;
  /** Custom spinner node shown while busy (defaults to a small CSS spinner). */
  spinner?: ReactNode;
  disabled?: boolean;
}

const GoogleLogo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const DefaultSpinner = () => (
  <span
    aria-hidden
    style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #c7d2fe", borderTopColor: "#6366f1", display: "inline-block", animation: "gbtn-spin .7s linear infinite" }}
  />
);

const DEFAULT_CLASS =
  "w-full flex items-center justify-center gap-3 py-3 px-4 border-2 border-slate-200 rounded-xl bg-white hover:bg-slate-50 hover:border-indigo-300 text-slate-700 font-semibold text-sm transition-all active:scale-[0.98] shadow-sm disabled:opacity-60";

export function GoogleButton({
  http, onLogin, onNeedsRegistration, onError,
  endpoint = "/auth/google", clientId, label = "Continue with Google",
  className, spinner, disabled,
}: GoogleButtonProps) {
  const [busy, setBusy] = useState(false);
  if (!googleConfigured(clientId)) return null; // hide when no Client ID

  const handleClick = async () => {
    setBusy(true);
    try {
      const accessToken = await signInWithGoogle(clientId);
      const res = await http.post(endpoint, { access_token: accessToken });
      if (res.data?.login) onLogin(res.data);
      else if (res.data?.needs_registration) onNeedsRegistration(res.data);
      else onError?.("Unexpected response from server");
    } catch (err: any) {
      onError?.(err?.response?.data?.message || err?.message || "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{`@keyframes gbtn-spin{to{transform:rotate(360deg)}}`}</style>
      <button type="button" onClick={handleClick} disabled={busy || disabled} className={className ?? DEFAULT_CLASS}>
        {busy ? (spinner ?? <DefaultSpinner />) : <GoogleLogo />}
        {label}
      </button>
    </>
  );
}

export default GoogleButton;

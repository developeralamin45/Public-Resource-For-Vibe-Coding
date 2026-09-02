import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import GoogleSetupGuideModal from './GoogleSetupGuideModal';

/**
 * The Google credentials, as a self-contained panel for an admin settings page.
 *
 * Drop it into the project's existing settings screen. It takes an injected
 * HTTP client rather than importing axios, so it works against any backend that
 * implements the two endpoints:
 *
 *     GET  {endpoint} → { "google.client_id": string, "google.client_secret": string,
 *                         "google.source": "panel"|"env"|"none", "app.url": string }
 *     PUT  {endpoint} ← { settings: { "google.client_id": …, "google.client_secret": … } }
 *
 * See SettingsGoogleRules.example.php for the server half.
 *
 * If the project's settings page already saves everything under one button,
 * lift the two fields and the guide button out of here into that form instead
 * of shipping a second Save — one screen with two save buttons is a bug report
 * waiting to happen.
 */

const ID_KEY = 'google.client_id';
const SECRET_KEY = 'google.client_secret';
/** Stands in for the stored secret, which never leaves the server. Pairs with GoogleAuth::SECRET_MASK. */
const SECRET_MASK = '********';

interface Http {
    get<T>(url: string): Promise<{ data: T }>;
    put<T>(url: string, body: unknown): Promise<{ data: T }>;
}

type Settings = Record<string, string | null>;

/* ------------------------------------------------------------------ chrome */

function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium text-fg-muted">{label}</label>
            {children}
            {hint && <p className="mt-1.5 text-xs text-fg-faint">{hint}</p>}
            {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
        </div>
    );
}

const inputClass =
    'w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 min-h-10 text-sm text-fg placeholder-fg-faint transition-colors duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none';

const ghostBtn =
    'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-150 hover:bg-ink-800 hover:text-fg';

/* -------------------------------------------------------------------- page */

export default function GoogleCredentialsPanel({ http, endpoint = '/admin/settings' }: { http: Http; endpoint?: string }) {
    const [clientId, setClientId] = useState('');
    const [secret, setSecret] = useState('');
    const [initial, setInitial] = useState({ id: '', secret: '' });
    const [source, setSource] = useState('none');
    const [siteUrl, setSiteUrl] = useState('');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [guideOpen, setGuideOpen] = useState(false);
    const [editSecret, setEditSecret] = useState(false);

    const apply = (s: Settings) => {
        const id = s[ID_KEY] ?? '';
        const sec = s[SECRET_KEY] ?? '';
        setClientId(id);
        setSecret(sec);
        setInitial({ id, secret: sec });
        setSource(s['google.source'] ?? 'none');
        setSiteUrl(s['app.url'] ?? '');
        setEditSecret(false);
    };

    useEffect(() => {
        let cancelled = false;
        http.get<Settings>(endpoint)
            .then(({ data }) => !cancelled && apply(data))
            .catch(() => !cancelled && setError('Could not load settings.'))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [endpoint]);

    const secretStored = initial.secret === SECRET_MASK;
    const dirty = clientId !== initial.id || secret !== initial.secret;
    // A client id typed but not yet saved counts as on: this reports the form,
    // not the database.
    const on = !!clientId.trim() || source === 'env';

    const save = async () => {
        setSaving(true);
        setError(null);
        setFieldError(null);
        try {
            const { data } = await http.put<Settings>(endpoint, {
                settings: { [ID_KEY]: clientId, [SECRET_KEY]: secret },
            });
            apply(data);
            setSaved(true);
        } catch (e) {
            const res = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response;
            setFieldError(res?.data?.errors?.[`settings.${ID_KEY}`]?.[0] ?? null);
            setError(res?.data?.message ?? 'Could not save.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <p className="text-sm text-fg-faint">Loading…</p>;

    return (
        <section className="space-y-4 rounded-2xl border border-ink-700 bg-ink-900 p-4 sm:p-5">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-fg">Google login</h2>
                    <p className="mt-0.5 text-xs text-fg-faint">Let people sign in with their Google account in one click.</p>
                </div>
                <button type="button" onClick={() => setGuideOpen(true)} className={`${ghostBtn} shrink-0`}>
                    Setup guide
                </button>
            </header>

            {!on ? (
                <p className="rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-2.5 text-xs text-fg-muted">
                    No Client ID yet, so the Google button is hidden on the login page. The{' '}
                    <span className="font-semibold text-fg">Setup guide</span> above walks through getting one.
                </p>
            ) : source === 'env' ? (
                <p className="rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-2.5 text-xs text-fg-muted">
                    Currently using the key from the server's <span className="font-mono text-fg">.env</span>. Saving one here takes over from it.
                </p>
            ) : null}

            <Field
                label="Client ID"
                error={fieldError}
                hint="From the Google console. Not a secret — the login page uses it in the browser. Clearing it switches Google login off."
            >
                <input
                    type="text"
                    value={clientId}
                    onChange={(e) => {
                        setClientId(e.target.value);
                        setSaved(false);
                    }}
                    placeholder="1234567890-abcdefg.apps.googleusercontent.com"
                    className={inputClass}
                />
            </Field>

            {/* The secret never leaves the server, so the form holds a mask.
                Typing into a masked field would append to the asterisks, so it
                is swapped for a real input only when asked — and can be put
                back untouched. */}
            {secretStored && !editSecret ? (
                <Field label="Client Secret" hint="This sign-in method does not need a secret.">
                    <div className="flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs text-fg-muted">A secret is saved (encrypted)</span>
                        <button
                            type="button"
                            onClick={() => {
                                setEditSecret(true);
                                setSecret('');
                                setSaved(false);
                            }}
                            className={`${ghostBtn} shrink-0`}
                        >
                            Change or remove
                        </button>
                    </div>
                </Field>
            ) : (
                <Field
                    label="Client Secret (optional)"
                    hint={
                        secretStored
                            ? 'Type a new secret — or save it empty to remove the stored one.'
                            : 'Not needed for this sign-in method. If you do save one it is encrypted, and never shown again.'
                    }
                >
                    <input
                        type="password"
                        autoComplete="new-password"
                        placeholder="GOCSPX-…"
                        value={secret}
                        onChange={(e) => {
                            setSecret(e.target.value);
                            setSaved(false);
                        }}
                        className={inputClass}
                    />
                    {secretStored && (
                        <button
                            type="button"
                            onClick={() => {
                                setEditSecret(false);
                                setSecret(SECRET_MASK);
                            }}
                            className="mt-2 text-xs font-medium text-fg-subtle underline-offset-2 hover:text-fg hover:underline"
                        >
                            Cancel — leave the saved secret alone
                        </button>
                    )}
                </Field>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex items-center justify-end gap-3">
                {saved && !dirty && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Saved</span>}
                <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || !dirty}
                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-600/25 transition hover:from-accent-500 hover:to-accent-700 disabled:opacity-50"
                >
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>

            <GoogleSetupGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} siteUrl={siteUrl} />
        </section>
    );
}

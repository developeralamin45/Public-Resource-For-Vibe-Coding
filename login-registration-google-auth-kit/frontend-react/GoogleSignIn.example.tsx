import { useEffect, useState } from 'react';
import { googleOffered, GoogleSignInCancelled, loadGoogleScript, requestGoogleToken } from './google';
import { isBdMobile, phoneFieldValue } from './phone';
import { useImeSafeInput } from './useImeSafeInput';

/**
 * EXAMPLE — the three pieces wired together, unstyled on purpose. Port the
 * behaviour into the project's own auth page and components; do not ship this
 * markup.
 *
 * `api` is the project's HTTP client (the kit never imports one). It is
 * expected to resolve with the response body and reject with something that
 * carries the server's `message`.
 */
type Api = { post: (url: string, body: unknown) => Promise<any> };

export function GoogleSignIn({ api, clientId, onSignedIn }: { api: Api; clientId: string; onSignedIn: (session: any) => void }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    // Set when Google vouched for an address the site has never seen.
    const [pending, setPending] = useState<{ name: string; email: string; google_token: string } | null>(null);
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');

    const phoneField = useImeSafeInput(phone, setPhone, phoneFieldValue);

    // Fetch Google's script before the tap needs it (see loadGoogleScript).
    useEffect(() => {
        if (googleOffered(clientId)) loadGoogleScript().catch(() => {});
    }, [clientId]);

    const start = async () => {
        setError('');
        setBusy(true);
        try {
            const token = await requestGoogleToken(clientId);
            const res = await api.post('/auth/google', { access_token: token });
            if (res.needs_registration) setPending(res);
            else onSignedIn(res);
        } catch (e: any) {
            // Closing the popup is a decision, not an error: say nothing.
            if (!(e instanceof GoogleSignInCancelled)) setError(e?.message ?? 'Google sign-in failed.');
        } finally {
            setBusy(false);
        }
    };

    const finish = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pending) return;
        // Normalize once more at submit: autofill and password managers can
        // set a value without any change event having run.
        const number = phoneFieldValue(phone);
        if (!isBdMobile(number)) return setError('Enter a valid Bangladeshi mobile number (e.g. 01712345678).');
        setError('');
        setBusy(true);
        try {
            onSignedIn(await api.post('/auth/google/register', {
                google_token: pending.google_token,
                phone: number,
                name: pending.name || name,
            }));
        } catch (e: any) {
            setError(e?.message ?? 'Registration failed. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    // ── The last step: who they are signed in as, one field, one button. ──
    // No password, no email box, no tabs — nothing Google already answered.
    if (pending) {
        return (
            <form onSubmit={finish}>
                <p>
                    <strong>{pending.name}</strong> {pending.email}
                </p>
                {pending.name === '' && (
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" required />
                )}
                <input type="tel" inputMode="numeric" maxLength={14} autoComplete="tel" placeholder="Phone number" required autoFocus {...phoneField} />
                {error && <p role="alert">{error}</p>}
                <button type="submit" disabled={busy}>Finish</button>
                <button type="button" onClick={() => setPending(null)}>Use a different email</button>
            </form>
        );
    }

    // The button and its divider come and go together: a divider above nothing
    // reads as a broken page.
    if (!googleOffered(clientId)) return null;

    return (
        <>
            <button type="button" onClick={start} onPointerDown={() => loadGoogleScript().catch(() => {})} disabled={busy}>
                {busy ? 'Please wait…' : 'Continue with Google'}
            </button>
            {error && <p role="alert">{error}</p>}
            <div aria-hidden="true">or sign in with email</div>
        </>
    );
}

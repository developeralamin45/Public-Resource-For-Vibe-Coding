import { useState } from 'react';
import type { ReactNode } from 'react';
import Modal from './Modal';

/**
 * The Google console walkthrough, as a modal beside the Client ID field.
 *
 * Five steps, in the order the console asks for them. Deliberately carries no
 * troubleshooting, no alternatives and no "if that fails" branches: every extra
 * path is one more thing to read while deciding where to click, and deciding is
 * what people get stuck on — not the typing. What it does carry is the exact
 * value for every field, built from the site's own address, so nothing has to
 * be remembered or retyped.
 *
 * Publishing sits at step 4, before the client id is pasted in. A published app
 * needs no test-user list, which removes a step and the whole class of "Access
 * blocked" that comes of forgetting it.
 *
 * `Modal` is a plain overlay + panel (backdrop click and Escape close it, body
 * scroll locks). Swap the import for the project's own dialog component.
 */

const LINKS = {
    project: 'https://console.cloud.google.com/projectcreate',
    branding: 'https://console.cloud.google.com/auth/branding',
    clients: 'https://console.cloud.google.com/auth/clients',
    audience: 'https://console.cloud.google.com/auth/audience',
} as const;

/* ---------------------------------------------------------------- controls */

/** A link out to the console — new tab, so this form is never lost. */
function GoTo({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-600 ring-1 ring-brand-500/30 transition-colors duration-150 ring-inset hover:bg-brand-500/20 sm:w-auto dark:text-brand-400"
        >
            {children}
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
            </svg>
        </a>
    );
}

/** One value to paste, under the name of the field it belongs in. */
function CopyRow({ value, label }: { value: string; label?: string }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            // Clipboard needs a secure context; the value stays selectable.
        }
    };

    return (
        <div>
            {label && <p className="mb-1 text-[11px] font-medium tracking-wide text-fg-faint uppercase">{label}</p>}
            <div className="flex items-center gap-2 rounded-lg bg-ink-850 p-1.5 pl-3 ring-1 ring-ink-700 ring-inset">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg select-all">{value}</code>
                <button
                    type="button"
                    onClick={() => void copy()}
                    className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                        copied ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-ink-800 text-fg-muted hover:bg-ink-700 hover:text-fg'
                    }`}
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
        </div>
    );
}

/**
 * One step.
 *
 * The badge sits in a fixed-width column and the connector is drawn on that
 * column, so the line runs from one number to the next whatever the step's
 * height — nothing to re-tune when the wording changes.
 */
function Step({ n, title, last = false, children }: { n: number; title: string; last?: boolean; children: ReactNode }) {
    return (
        <li className="flex gap-3.5">
            <div className="flex w-8 shrink-0 flex-col items-center">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-500/15 text-sm font-bold text-accent-600 dark:text-accent-400">
                    {n}
                </span>
                {!last && <span className="mt-1.5 w-px flex-1 bg-ink-700" aria-hidden="true" />}
            </div>
            <div className={`min-w-0 flex-1 space-y-2.5 pt-1 ${last ? '' : 'pb-6'}`}>
                <h3 className="text-sm font-bold text-fg">{title}</h3>
                {children}
            </div>
        </li>
    );
}

/** A label exactly as it reads in the console, so the eye can match it. */
function UI({ children }: { children: ReactNode }) {
    return <span className="font-semibold text-fg">{children}</span>;
}

/** The instruction line inside a step. */
function P({ children }: { children: ReactNode }) {
    return <p className="text-xs leading-relaxed text-fg-muted">{children}</p>;
}

/* -------------------------------------------------------------------- page */

export default function GoogleSetupGuideModal({
    open,
    onClose,
    siteUrl,
}: {
    open: boolean;
    onClose: () => void;
    /** The site's public address, from the server. Falls back to this browser's. */
    siteUrl?: string;
}) {
    const browserOrigin = typeof window === 'undefined' ? '' : window.location.origin;

    // Google is told about the live site, which is not necessarily the host this
    // admin is browsing from — on a developer's machine that is localhost, and
    // localhost is not the site's home page or privacy policy.
    const site = (siteUrl || browserOrigin).replace(/\/+$/, '');

    // The browser can only sign in from an origin Google has been told to trust,
    // so the address in use right now belongs on the list beside the live one.
    const origins = browserOrigin && browserOrigin !== site ? [site, browserOrigin] : [site];

    return (
        <Modal open={open} title="Google login setup" onClose={onClose} panelClassName="max-w-xl">
            <p className="mb-6 text-xs leading-relaxed text-fg-muted">Five steps, once. Every link opens in a new tab.</p>

            <ol>
                <Step n={1} title="Create a project">
                    <P>
                        Give the project a name and press <UI>CREATE</UI>. If you already have one, pick it from the bar at the top.
                    </P>
                    <GoTo href={LINKS.project}>New project page</GoTo>
                </Step>

                <Step n={2} title="Fill in Branding">
                    <P>
                        Give the app a name, a logo and a support email. Then put these three addresses in the <UI>App domain</UI> section and press{' '}
                        <UI>SAVE</UI>.
                    </P>
                    <div className="space-y-2">
                        <CopyRow label="Application home page" value={site} />
                        <CopyRow label="Application privacy policy link" value={`${site}/privacy`} />
                        <CopyRow label="Application terms of service link" value={`${site}/terms`} />
                    </div>
                    <GoTo href={LINKS.branding}>Branding page</GoTo>
                </Step>

                <Step n={3} title="Create a client">
                    <P>
                        <UI>CREATE CLIENT</UI> → Application type <UI>Web application</UI> → give it a name. Then, under{' '}
                        <UI>Authorized JavaScript origins</UI>, press <UI>+ Add URI</UI> and add these.
                    </P>
                    <div className="space-y-2">
                        {origins.map((value) => (
                            <CopyRow key={value} value={value} />
                        ))}
                    </div>
                    <P>
                        Leave <UI>Authorized redirect URIs</UI> below it <span className="font-semibold text-fg">empty</span> — this flow does not use
                        one. Then <UI>CREATE</UI>.
                    </P>
                    <GoTo href={LINKS.clients}>Clients page</GoTo>
                </Step>

                <Step n={4} title="Publish the app">
                    <P>
                        Press <UI>PUBLISH APP</UI> so the status reads <UI>In production</UI>. This site asks Google only for a name, an email and a
                        picture, so there is no review to wait for — it goes live the moment you press it.
                    </P>
                    <GoTo href={LINKS.audience}>Audience page</GoTo>
                </Step>

                <Step n={5} title="Copy the Client ID here" last>
                    <P>
                        Copy the <UI>Client ID</UI> from the Clients list into the field on this page and press <UI>Save</UI>. Then open the login page
                        and try it.
                    </P>
                </Step>
            </ol>

            <div className="mt-2 flex justify-end border-t border-ink-700 pt-4">
                <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded-lg bg-ink-800 px-5 py-2 text-sm font-semibold text-fg transition-colors duration-150 hover:bg-ink-700 sm:w-auto"
                >
                    Got it
                </button>
            </div>
        </Modal>
    );
}

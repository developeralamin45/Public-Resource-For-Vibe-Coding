/**
 * The checkout's vocabulary: methods, the bank account, what a claim is,
 * what the server answers, and the localStorage that lets an in-progress
 * payment survive a refresh or a trip to the wallet app.
 *
 * Framework-free. vanilla/send-money-checkout.js carries the same rules in
 * plain JS; a change here belongs there too.
 */

/** The three mobile wallets. Money arrives by Send Money, and the reference
 *  the customer gives back is the number they sent it from. */
export type WalletMethod = 'bkash' | 'nagad' | 'rocket';

/**
 * Bank transfer is deliberately not a wallet. It has no send-money app, no
 * tab in the popup's switcher (it is a one-way door), and the reference it
 * takes is whatever the bank printed on the slip rather than a phone number.
 */
export type PaymentMethod = WalletMethod | 'bank';

export const WALLET_METHODS: WalletMethod[] = ['bkash', 'nagad', 'rocket'];

export const isWalletMethod = (m: PaymentMethod): m is WalletMethod => m !== 'bank';

/** Methods whose reference is a typed transaction id, not the sender's number. */
export const isTrxMethod = (m: PaymentMethod): boolean => m === 'rocket' || m === 'bank';

/**
 * Where a bank transfer lands. `branch` and `routingNumber` are optional —
 * plenty of accounts have neither worth printing, and a blank row reads as a
 * mistake, so those rows are skipped rather than rendered empty.
 */
export interface BankDetails {
    bankName: string;
    accountName: string;
    accountNumber: string;
    branch?: string;
    routingNumber?: string;
}

/**
 * What the merchant can receive on. A wallet with no number is not offered
 * anywhere — picker, tabs, popup — and `bank: null` (or absent) means the
 * bank method never shows. Serve this from the server (an admin-editable
 * settings row if the project has a panel); never hardcode a merchant number
 * in a bundle.
 */
export interface PaymentConfig {
    bkash?: string;
    nagad?: string;
    rocket?: string;
    bank?: BankDetails | null;
}

/**
 * A bank account is only offerable once all three mandatory rows are filled.
 * Half a set of details is worse than no bank option at all: the customer
 * sends the money somewhere it cannot arrive.
 */
export const bankFromDoc = (raw: unknown): BankDetails | null => {
    if (!raw || typeof raw !== 'object') return null;
    const b = raw as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    // Both spellings, so a snake_case settings row from a PHP backend works too.
    const bankName = str(b.bankName) || str(b.bank_name);
    const accountName = str(b.accountName) || str(b.account_name);
    const accountNumber = str(b.accountNumber) || str(b.account_number);
    if (!bankName || !accountName || !accountNumber) return null;
    const branch = str(b.branch);
    const routingNumber = str(b.routingNumber) || str(b.routing_number);
    return {
        bankName, accountName, accountNumber,
        ...(branch ? { branch } : {}),
        ...(routingNumber ? { routingNumber } : {}),
    };
};

/** Whatever the server sent → the shape the UI reads. One parser, so every
 *  surface that shows the numbers can never drift apart. */
export const readPaymentConfig = (data: unknown): PaymentConfig => {
    const d = (data || {}) as Partial<Record<string, unknown>>;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    return {
        ...(str(d.bkash) ? { bkash: str(d.bkash) } : {}),
        ...(str(d.nagad) ? { nagad: str(d.nagad) } : {}),
        ...(str(d.rocket) ? { rocket: str(d.rocket) } : {}),
        bank: bankFromDoc(d.bank),
    };
};

/** The bank rows, in the order a customer fills them into the bank app. */
export const bankRows = (bank: BankDetails): { label: string; value: string; mono: boolean }[] => [
    { label: 'ব্যাংক', value: bank.bankName, mono: false },
    { label: 'অ্যাকাউন্ট হোল্ডার', value: bank.accountName, mono: false },
    { label: 'অ্যাকাউন্ট নম্বর', value: bank.accountNumber, mono: true },
    { label: 'ব্রাঞ্চ', value: bank.branch || '', mono: false },
    { label: 'রাউটিং নম্বর', value: bank.routingNumber || '', mono: true },
].filter(r => !!r.value);

/** One tap hands over the whole account, labels included — ready to paste into
 *  the bank app's notes or a message to whoever does the transfer. */
export const bankCopyText = (bank: BankDetails): string =>
    bankRows(bank).map(r => `${r.label}: ${r.value}`).join('\n');

/**
 * Bank references are the wild west — every bank prints a different shape
 * (FT26AB12CD, 2026/00412, plain digits). Bound the length, allow the two
 * separators banks actually use, and leave the rest to the human verifier.
 */
export const BANK_REF_RE = /^[A-Za-z0-9/-]{4,40}$/;

/** Safe on every keystroke: drops what a reference can never contain. */
export const sanitizeBankRef = (raw: string): string =>
    raw.replace(/[^A-Za-z0-9/-]/g, '').toUpperCase().slice(0, 40);

export type BankRefCheck = { ok: true; ref: string } | { ok: false; error: string };

export const validateBankRef = (raw: string): BankRefCheck => {
    const ref = sanitizeBankRef(raw.trim());
    if (!ref) return { ok: false, error: 'ট্রানজেকশন আইডি / রেফারেন্স লিখুন।' };
    if (!BANK_REF_RE.test(ref)) {
        return { ok: false, error: 'সঠিক ট্রানজেকশন আইডি / রেফারেন্স দিন (৪–৪০ অক্ষর)।' };
    }
    return { ok: true, ref };
};

export interface PaymentMethodMeta {
    key: PaymentMethod;
    label: string;
    bn: string;
    color: string;
    soft: string;
}

/** Brand colours, exactly as the production page paints them. */
export const PAYMENT_METHODS: PaymentMethodMeta[] = [
    { key: 'bkash', label: 'bKash', bn: 'বিকাশ', color: '#E2136E', soft: '#FFF0F7' },
    { key: 'nagad', label: 'Nagad', bn: 'নগদ', color: '#F05829', soft: '#FFF4F0' },
    { key: 'rocket', label: 'Rocket', bn: 'রকেট', color: '#8B3FA8', soft: '#F8F0FF' },
    { key: 'bank', label: 'Bank', bn: 'ব্যাংক', color: '#2563EB', soft: '#EAF1FE' },
];

/** Bangla labels for a stored method — used wherever a submission is read back. */
export const METHOD_LABEL: Record<PaymentMethod, string> = {
    bkash: 'বিকাশ', nagad: 'নগদ', rocket: 'রকেট', bank: 'ব্যাংক',
};

/** The methods this merchant can actually receive on, in picker order. */
export const availableMethods = (config: PaymentConfig): PaymentMethodMeta[] =>
    PAYMENT_METHODS.filter(m => (m.key === 'bank' ? !!config.bank : !!config[m.key]));

// ── Who the order is for: name + phone, asked BEFORE payment ──
// Two purposes, and the second is the reason it is not part of the payment
// popup: a visitor who types a number here can be recorded server-side
// (onLead) even if they never pay, so a drop-off can still be called back.
// Kept locally as well, so the visitor types their name and number once.
export interface LandingLead {
    name: string;
    phone: string;
}

/**
 * How far down the funnel a lead got — the one thing that decides what you
 * say when you ring them.
 *
 *   typed     — left a name and number, nothing more.
 *   checkout  — opened the payment popup and saw the number to send money to.
 *   paid      — submitted a sender number / TrxID, so they believe they paid.
 *
 * The server must enforce the order: the page re-reports `typed` on every
 * keystroke pause, so a lead who reached `paid` and then fixed a typo in
 * their name must not fall back to the top.
 */
export type LeadStage = 'typed' | 'checkout' | 'paid';

export const LEAD_STAGES: LeadStage[] = ['typed', 'checkout', 'paid'];

export const leadStageRank = (stage: LeadStage): number => LEAD_STAGES.indexOf(stage);

// ── The claim, and the server's answer to it ──
/** What the popup hands the server at submit. */
export interface PaymentClaim {
    method: PaymentMethod;
    /** Canonical: `01XXXXXXXXX` for bKash/Nagad, an upper-case TrxID for Rocket, the bank's reference. */
    reference: string;
    /** What the visitor was told to send, so the record matches the offer they saw. */
    amount: number;
    /** The order form's name and number — empty strings when the form is off. */
    lead: LandingLead;
    /** The checkout this claim belongs to (the `popupKey`). */
    popupKey: string;
}

// ── "Did the money arrive?" — the claim check's answer ──
// `verifier` is the server saying it cannot know: auto-verify is switched
// off, or the SMS forwarder has been silent for hours. Then the page must
// not say "not received" — only that it is being checked.
export type ClaimCheck =
    | { found: true; amount: number; underpaid?: boolean; gateway?: string }
    | { found: false; throttled?: boolean; verifier?: 'off' | 'stale' };

/** How often the page asks again, and for how long, after a "not yet". */
export const CLAIM_POLL_MS = 8_000;
export const CLAIM_WINDOW_MS = 120_000;
/** "Continue anyway" appears after this much looking — the first
 *  half-minute belongs to the number. */
export const CLAIM_CONTINUE_AFTER_MS = 30_000;

// ── Completed payment submission (what the host is handed at onSuccess) ──
export interface PaymentInfo {
    method: PaymentMethod;
    reference: string;
    submittedAt: string;
    amount: number;
    /** The server found the money. Absent/false: a claim, nothing more. */
    verified?: boolean;
    verifiedAmount?: number;
}

// ── localStorage, namespaced by popupKey ──
// Same keys in both variants, so a project migrating vanilla → React does not
// strand a buyer's half-typed reference mid-payment.
const key = (name: string, popupKey: string) => `bdpay_${name}_${popupKey}`;
const LEAD_KEY = 'bdpay_lead';

const read = <T,>(k: string): T | null => {
    try {
        const raw = localStorage.getItem(k);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const drop = (k: string) => { try { localStorage.removeItem(k); } catch { /* silent */ } };

export const getStoredLead = (): LandingLead | null => {
    const p = read<Partial<LandingLead>>(LEAD_KEY);
    return p && (p.name || p.phone) ? { name: p.name || '', phone: p.phone || '' } : null;
};
export const saveStoredLead = (lead: LandingLead): void => write(LEAD_KEY, lead);

/** In-progress popup: which method, and what is typed in the reference field. */
export interface PayUiState {
    method: PaymentMethod;
    value: string;
}
export const getPayUi = (popupKey: string): PayUiState | null => {
    const p = read<Partial<PayUiState>>(key('ui', popupKey));
    return p && p.method ? { method: p.method, value: p.value || '' } : null;
};
export const savePayUi = (popupKey: string, state: PayUiState): void => write(key('ui', popupKey), state);
export const clearPayUi = (popupKey: string): void => drop(key('ui', popupKey));

/** The submitted claim, kept until the host says the order is complete. */
export const getPaymentInfo = (popupKey: string): PaymentInfo | null => {
    const p = read<Partial<PaymentInfo>>(key('done', popupKey));
    return p && p.method && p.reference ? (p as PaymentInfo) : null;
};
export const savePaymentInfo = (popupKey: string, info: PaymentInfo): void => write(key('done', popupKey), info);
/** Call this from the host once the order/registration is complete, so the
 *  done card does not greet the next visit. */
export const clearPaymentInfo = (popupKey: string): void => drop(key('done', popupKey));

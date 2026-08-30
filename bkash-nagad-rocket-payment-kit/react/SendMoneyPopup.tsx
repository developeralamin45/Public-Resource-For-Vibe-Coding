import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import bkashLogo from "./assets/bkash.webp";
import nagadLogo from "./assets/nagad.webp";
import rocketLogo from "./assets/rocket.webp";

/**
 * SendMoneyPopup — a faithful bKash / Nagad / Rocket "Send Money" checkout popup
 * for Bangladeshi manual-payment (MFS) flows.
 *
 * ── Design goal ────────────────────────────────────────────────────────────
 * Drop-in, pixel-faithful popup: brand header strip, amount card, copy-able
 * receiver number, step-by-step instructions, and a validated reference input
 * (sender number for bKash/Nagad, TrxID for Rocket). Fully responsive.
 *
 * ── Zero coupling ──────────────────────────────────────────────────────────
 * Depends ONLY on React. It knows nothing about your backend, router, or auth.
 * You wire it up through props:
 *   • onSubmit(provider, reference)  → call YOUR API; resolve to continue,
 *                                       throw an Error(message) to show a toast.
 *   • onClose()                      → close the popup (called after confirm).
 *
 * ── Why the portal? (keep this) ────────────────────────────────────────────
 * The overlay is portaled to <body> so it escapes any parent stacking context
 * (a `transform`, `filter`, or `position:relative; z-index` ancestor). Without
 * it a high z-index only outranks siblings INSIDE that ancestor, so a sticky
 * header elsewhere in the tree can paint OVER the "blurred" backdrop. At body
 * level the overlay sits in the root stacking context and dims everything.
 *
 * ── In-app browsers (Facebook, Instagram) — REQUIRED companion ────────────
 * Facebook's WebView lets the on-screen keyboard cover the page without
 * resizing it, and often without firing a visualViewport resize event, so the
 * reference input can vanish behind the keyboard mid-typing. Ship
 * ../vanilla/keyboard-aware.js on any page that renders this popup (it is
 * framework-agnostic: one <script> tag in index.html). This component carries
 * its half of the contract: scroll-margins on the input so the reveal brings
 * the submit button along, a toast that lifts above the keyboard when the
 * kit flags `html[data-kb]`, and Enter-to-submit so the keyboard's own enter
 * key works when the button is the one thing still covered.
 */

export type Provider = "bkash" | "nagad" | "rocket";

export interface ProviderBrand {
  label: string; // native label shown in the UI (e.g. "বিকাশ")
  en: string; // english/alt name (alt text)
  brand: string; // primary brand color
  dark: string; // darker shade (gradients, accents)
  light: string; // light tint (backgrounds)
  logo: string; // logo URL
  /** true → reference is a Transaction ID (Rocket); false → sender phone number. */
  usesTrxId?: boolean;
}

/** Default BD MFS brands. Override any field via the `brands` prop. */
export const DEFAULT_BRANDS: Record<Provider, ProviderBrand> = {
  bkash:  { label: "বিকাশ", en: "bKash",  brand: "#E2136E", dark: "#b80e58", light: "#fcebf3", logo: bkashLogo },
  nagad:  { label: "নগদ",  en: "Nagad",  brand: "#F05921", dark: "#c94515", light: "#fff3ee", logo: nagadLogo },
  rocket: { label: "রকেট", en: "Rocket", brand: "#8C3494", dark: "#6b277a", light: "#f7eef9", logo: rocketLogo, usesTrxId: true },
};

// BD mobile: 11 digits starting 01 — deliberately silent about the operator
// digit. Operators reshuffle their ranges; a hardcoded 013–019 list starts
// rejecting real customers the day a new range opens. Mirror this server-side.
const PHONE_RE = /^01\d{9}$/;
const TRX_RE = /^[A-Za-z0-9]{10}$/; // MFS TrxID: 10 alphanumerics

const toBn = (n: number | string) => String(n).replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[+d]);

/** Smart-normalize a pasted/typed BD number: Bengali digits → Latin,
 *  strip +/hyphens/spaces, +880/880 → leading 0, "17…" (10 digits) → "017…". */
const BN_DIGITS: Record<string, string> = { "০":"0","১":"1","২":"2","৩":"3","৪":"4","৫":"5","৬":"6","৭":"7","৮":"8","৯":"9" };
export const bdPhoneNormalize = (raw: string): string => {
  let digits = String(raw || "")
    .replace(/[০-৯]/g, (d) => BN_DIGITS[d])
    .replace(/\D+/g, "");
  if (digits.startsWith("8801") && digits.length >= 13) digits = "0" + digits.slice(3);
  if (digits.length === 10 && digits.charAt(0) === "1") digits = "0" + digits;
  return digits.slice(0, 11);
};

/* ─── Popup-scoped CSS (all classes prefixed dp-* so nothing leaks) ─── */
const POPUP_CSS = `
/* The overlay is fixed and scrolls itself, so the page-level room reserved by
   keyboard-aware.js cannot reach inside — the kit hands the measurement over
   in --kb-reserve and this is where the popup spends it: the card gains
   exactly the scroll range needed to lift the reference field clear of the
   keyboard. !important because the center div carries inline padding. */
html[data-kb] .dp-center{padding-bottom:calc(20px + var(--kb-reserve,0px)) !important;}
.dp-card{margin:0 auto;background:#fff;border-radius:28px;width:100%;max-width:440px;box-shadow:0 16px 40px rgba(0,0,0,.12);animation:dpSlideUp .4s cubic-bezier(.34,1.45,.64,1) forwards;position:relative;font-family:'Anek Bangla','Hind Siliguri',sans-serif;}
@keyframes dpSlideUp{from{opacity:0;transform:translateY(40px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.dp-strip{background:linear-gradient(135deg,var(--brand) 0%,var(--brand-dark) 100%);border-radius:28px 28px 0 0;padding:16px;display:flex;align-items:center;gap:12px;position:relative;}
.dp-strip-logo{width:46px;height:46px;border-radius:12px;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:6px;object-fit:contain;flex-shrink:0;}
.dp-strip-name{font-size:17px;font-weight:800;color:#fff;line-height:1.2;white-space:nowrap;margin:0;}
.dp-strip-sub{font-size:12px;color:rgba(255,255,255,.85);margin:2px 0 0;}
.dp-close{position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,.18);color:#fff;font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.dp-close:hover{background:rgba(255,255,255,.3);}
.dp-body{padding:16px;}
.dp-amount{background:var(--brand-light);border:1px solid rgba(0,0,0,.05);border-radius:14px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.dp-amount-left{display:flex;align-items:center;gap:10px;}
.dp-amount-icon{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.dp-amount-icon svg{width:18px;height:18px;stroke:var(--brand-dark);}
.dp-amount-label-txt{font-size:16px;color:#475569;font-weight:700;}
.dp-amount-val{font-size:28px;font-weight:800;color:var(--brand-dark);letter-spacing:-.5px;}
.dp-num-lbl{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:#334155;margin:0 0 8px;}
.dp-num-lbl svg{width:16px;height:16px;stroke:var(--brand);}
.dp-num-box{display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:14px;padding:12px 14px;margin-bottom:14px;}
.dp-num{font-size:22px;font-weight:800;color:#1e293b;letter-spacing:2px;}
.dp-copy{display:flex;align-items:center;gap:6px;background:var(--brand);border:none;border-radius:10px;padding:8px 14px;cursor:pointer;color:#fff;font-size:13px;font-weight:700;transition:all .2s;white-space:nowrap;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.15);}
.dp-copy:hover{background:var(--brand-dark);}
.dp-copy.copied{background:#10b981;box-shadow:0 2px 8px rgba(16,185,129,.3);}
.dp-copy svg{width:14px;height:14px;}
.dp-steps-ttl{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:#334155;margin:0 0 8px;}
.dp-steps-ttl svg{width:16px;height:16px;stroke:var(--brand);}
.dp-steps{background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid var(--brand);border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;flex-direction:column;gap:8px;}
.dp-step{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:#334155;font-weight:600;line-height:1.4;}
.dp-step-n{background:var(--brand);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;}
.dp-inp-lbl{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:#334155;margin:0 0 8px;}
.dp-inp-lbl svg{width:16px;height:16px;stroke:var(--brand);}
.dp-inp{width:100%;padding:14px 16px;background:#fff;border:2px solid #cbd5e1;border-radius:12px;font-size:18px;font-weight:700;color:#0f172a;outline:none;transition:border-color .2s;letter-spacing:1px;margin-bottom:14px;box-sizing:border-box;scroll-margin-bottom:80px;scroll-margin-top:32px;}
.dp-inp::placeholder{font-size:14px;letter-spacing:0;color:#94a3b8;font-weight:500;}
.dp-inp:focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-light);}
.dp-inp.error{border-color:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.15);animation:dpShake .4s ease;}
@keyframes dpShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
.dp-btn{width:100%;padding:15px;background:linear-gradient(135deg,var(--brand) 0%,var(--brand-dark) 100%);color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:800;cursor:pointer;transition:all .2s;box-shadow:0 6px 20px rgba(0,0,0,.15);font-family:inherit;}
.dp-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 25px rgba(0,0,0,.2);}
.dp-btn:disabled{opacity:.7;cursor:not-allowed;transform:none;}
.dp-btn.success{background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 6px 20px rgba(16,185,129,.3);}
.dp-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 24px;border-radius:50px;font-size:14px;font-weight:600;z-index:2147483647;white-space:nowrap;box-shadow:0 10px 30px rgba(0,0,0,.2);transition:bottom .15s ease;}
html[data-kb] .dp-toast{bottom:calc(24px + var(--kb-reserve,0px));}
.dp-confirm{position:absolute;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);border-radius:28px;display:flex;align-items:center;justify-content:center;padding:20px;z-index:5;}
.dp-confirm-card{background:#fff;border-radius:18px;padding:20px;max-width:300px;width:100%;text-align:center;box-shadow:0 16px 40px rgba(0,0,0,.2);}
.dp-confirm-ttl{font-size:16px;font-weight:800;color:#0f172a;margin:0 0 6px;}
.dp-confirm-msg{font-size:13px;color:#64748b;margin:0 0 16px;line-height:1.5;}
.dp-confirm-row{display:flex;gap:8px;}
.dp-confirm-btn{flex:1;padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;border:none;font-family:inherit;}
.dp-confirm-no{background:#f1f5f9;color:#475569;}
.dp-confirm-yes{background:#ef4444;color:#fff;}
`;

/* Inline SVG icons (no icon-library dependency) */
const IconBank = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
);
const IconPhone = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
);
const IconCopy = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
);
const IconSteps = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
);
const IconLock = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);

export interface SendMoneyPopupLabels {
  headerSuffix?: string; // after brand label in the header (e.g. "সেন্ড মানি করুন (পার্সোনাল)")
  brandSubtitle?: string; // small line under the header title
  amountLabel?: string;
  receiverLabel?: string;
  copy?: string;
  copied?: string;
  stepsTitle?: string;
  step2?: (brandLabel: string) => string;
  submit?: string;
  submitting?: string;
  submitted?: string;
  confirmTitle?: string;
  confirmMessage?: string;
  confirmYes?: string;
  confirmNo?: string;
  toastCopied?: string;
}

const DEFAULT_LABELS: Required<SendMoneyPopupLabels> = {
  headerSuffix: "সেন্ড মানি করুন",
  brandSubtitle: "নিরাপদ পেমেন্ট",
  amountLabel: "মোট পরিমাণ",
  receiverLabel: "যে নম্বরে টাকা পাঠাবেন",
  copy: "কপি করুন",
  copied: "কপি হয়েছে ✓",
  stepsTitle: "কীভাবে টাকা পাঠাবেন",
  step2: (b) => `${b} অ্যাপ থেকে <strong>Send Money</strong> করুন`,
  submit: "সাবমিট করুন",
  submitting: "জমা হচ্ছে...",
  submitted: "✅ সফলভাবে জমা হয়েছে!",
  confirmTitle: "পেমেন্ট বন্ধ করবেন?",
  confirmMessage: "আপনি কি নিশ্চিত? আপনার দেওয়া তথ্য মুছে যাবে।",
  confirmYes: "হ্যাঁ, বন্ধ করুন",
  confirmNo: "না, চালিয়ে যাই",
  toastCopied: "✅ নম্বর কপি হয়েছে!",
};

export interface SendMoneyPopupProps {
  provider: Provider;
  /** Amount to display (formatted to Bangla digits with a ৳ prefix). */
  amount: number | string;
  /** The receiver (merchant) MFS number the customer sends money to. */
  receiverNumber: string;
  /**
   * Called when the customer submits their reference. `reference` is a sender
   * phone number (bKash/Nagad) or a TrxID (Rocket). Return a Promise — resolve
   * to show the success state, or throw new Error(msg) to surface `msg` in a
   * toast and keep the popup open.
   */
  onSubmit: (provider: Provider, reference: string) => Promise<void> | void;
  /** Close the popup (invoked after the built-in confirm, or after success). */
  onClose: () => void;
  brands?: Record<Provider, ProviderBrand>;
  labels?: SendMoneyPopupLabels;
  /** Skip the "are you sure?" confirmation when closing. Default: false. */
  skipCloseConfirm?: boolean;
  /** Optional: fired once a submit succeeds (e.g. analytics). */
  onSuccess?: (provider: Provider, reference: string) => void;
  /** ms to keep the success state before onClose is auto-called. 0 = manual. */
  autoCloseMs?: number;
}

export function SendMoneyPopup({
  provider, amount, receiverNumber, onSubmit, onClose,
  brands = DEFAULT_BRANDS, labels, skipCloseConfirm = false, onSuccess, autoCloseMs = 1300,
}: SendMoneyPopupProps) {
  const b = brands[provider];
  const t = { ...DEFAULT_LABELS, ...labels };
  const isTrx = !!b.usesTrxId;

  const [ref, setRef] = useState("");
  const [err, setErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState("");
  const [confirming, setConfirming] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // An IME (Bangla keyboard, Gboard suggestions, swipe typing) holds
  // half-finished text in a composition the browser owns; rewriting the value
  // mid-composition snaps the caret and corrupts the word. Normalize only when
  // the composition commits — and treat blur as a commit, because Facebook's
  // WebView has been seen swallowing compositionend entirely.
  const imeOpen = useRef(false);
  const normalizeIfPhone = (v: string) => (isTrx ? v : bdPhoneNormalize(v));

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };

  const requestClose = () => {
    if (skipCloseConfirm) { onClose(); return; }
    setConfirming(true);
  };

  const copyNumber = () => {
    const legacy = () => {
      const i = document.createElement("input");
      i.value = receiverNumber; document.body.appendChild(i); i.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(i);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(receiverNumber).catch(legacy);
    else legacy();
    setCopied(true);
    showToast(t.toastCopied);
    setTimeout(() => setCopied(false), 2500);
  };

  const submit = async () => {
    // One last normalize catches a paste whose compositionend never fired.
    const v = normalizeIfPhone(ref.trim());
    const ok = isTrx ? TRX_RE.test(v) : PHONE_RE.test(v);
    if (!ok) {
      setErr(true);
      showToast(isTrx ? "সঠিক ১০ অক্ষরের Transaction ID দিন" : "সঠিক মোবাইল নম্বর দিন (১১ সংখ্যা)");
      setTimeout(() => setErr(false), 1600);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(provider, isTrx ? v.toUpperCase() : v);
      setDone(true);
      onSuccess?.(provider, isTrx ? v.toUpperCase() : v);
      if (autoCloseMs > 0) setTimeout(onClose, autoCloseMs);
    } catch (e: any) {
      setBusy(false);
      showToast(e?.message || "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[2147483000] bg-slate-900/55 backdrop-blur-sm overflow-y-auto"
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", backdropFilter: "blur(4px)", overflowY: "auto", overscrollBehavior: "contain", zIndex: 2147483000 }}>
      <div className="dp-center" style={{ display: "flex", minHeight: "100%", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <style>{POPUP_CSS}</style>
        <div className="dp-card" style={{ ["--brand" as any]: b.brand, ["--brand-dark" as any]: b.dark, ["--brand-light" as any]: b.light }}>
          {/* Header strip */}
          <div className="dp-strip">
            <img src={b.logo} alt={b.en} className="dp-strip-logo" />
            <div>
              <p className="dp-strip-name">{b.label} {t.headerSuffix}</p>
              <p className="dp-strip-sub">{t.brandSubtitle}</p>
            </div>
            <button type="button" className="dp-close" onClick={requestClose} disabled={busy || done} aria-label="বন্ধ করুন">✕</button>
          </div>

          <div className="dp-body">
            {/* Amount */}
            <div className="dp-amount">
              <div className="dp-amount-left">
                <div className="dp-amount-icon"><IconBank /></div>
                <span className="dp-amount-label-txt">{t.amountLabel}</span>
              </div>
              <span className="dp-amount-val">৳{toBn(amount)}</span>
            </div>

            {/* Receiver number */}
            <p className="dp-num-lbl"><IconPhone /> {t.receiverLabel}</p>
            <div className="dp-num-box">
              <span className="dp-num">{receiverNumber}</span>
              <button type="button" className={`dp-copy${copied ? " copied" : ""}`} onClick={copyNumber}>
                <IconCopy /><span>{copied ? t.copied : t.copy}</span>
              </button>
            </div>

            {/* Steps */}
            <p className="dp-steps-ttl"><IconSteps /> {t.stepsTitle}</p>
            <div className="dp-steps">
              <div className="dp-step"><span className="dp-step-n">১</span><span>উপরের নম্বরটি <strong>কপি</strong> করুন</span></div>
              <div className="dp-step"><span className="dp-step-n">২</span><span dangerouslySetInnerHTML={{ __html: t.step2(b.label) }} /></div>
              {isTrx
                ? <div className="dp-step"><span className="dp-step-n">৩</span><span>নিচে <strong>Transaction ID</strong> লিখে জমা দিন</span></div>
                : <div className="dp-step"><span className="dp-step-n">৩</span><span>নিচে <strong>আপনার নম্বর</strong> লিখে জমা দিন</span></div>}
            </div>

            {/* Reference input */}
            <label className="dp-inp-lbl">
              {isTrx ? <IconLock /> : <IconPhone />}
              {isTrx ? "আপনার Transaction ID (TrxID)" : "আপনি যে নম্বর থেকে টাকা পাঠিয়েছেন"}
            </label>
            <input
              className={`dp-inp${err ? " error" : ""}`}
              type={isTrx ? "text" : "tel"}
              inputMode={isTrx ? undefined : "numeric"}
              maxLength={isTrx ? 10 : 14} /* phones: paste room for +880… before normalize trims */
              placeholder={isTrx ? "TRXID দিন" : "01XXXXXXXXX"}
              style={isTrx ? { textTransform: "uppercase" } : undefined}
              value={ref}
              onChange={(e) => {
                const raw = e.target.value;
                const mid = imeOpen.current || (e.nativeEvent as InputEvent).isComposing;
                setRef(mid ? raw : normalizeIfPhone(raw));
              }}
              onCompositionStart={() => { imeOpen.current = true; }}
              onCompositionEnd={(e) => {
                imeOpen.current = false;
                setRef(normalizeIfPhone((e.target as HTMLInputElement).value));
              }}
              onBlur={() => {
                if (!imeOpen.current) return;
                imeOpen.current = false;
                setRef((v) => normalizeIfPhone(v));
              }}
              onKeyDown={(e) => {
                /* The keyboard's own enter key is the one submit control the
                   keyboard can never cover. 229/isComposing = an IME mid-word
                   claiming the keystroke: not ours. */
                if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                if (!busy && !done) submit();
              }}
              disabled={busy || done}
            />

            <button type="button" className={`dp-btn${done ? " success" : ""}`} disabled={busy} onClick={submit}>
              {done ? t.submitted : busy ? t.submitting : t.submit}
            </button>
          </div>

          {/* Close confirmation (in-popup, no external dependency) */}
          {confirming && (
            <div className="dp-confirm">
              <div className="dp-confirm-card">
                <p className="dp-confirm-ttl">{t.confirmTitle}</p>
                <p className="dp-confirm-msg">{t.confirmMessage}</p>
                <div className="dp-confirm-row">
                  <button className="dp-confirm-btn dp-confirm-no" onClick={() => setConfirming(false)}>{t.confirmNo}</button>
                  <button className="dp-confirm-btn dp-confirm-yes" onClick={onClose}>{t.confirmYes}</button>
                </div>
              </div>
            </div>
          )}
        </div>
        {toast && <div className="dp-toast">{toast}</div>}
      </div>
    </div>,
    document.body,
  );
}

export default SendMoneyPopup;

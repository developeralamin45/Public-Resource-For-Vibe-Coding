import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import bkashLogo from "./assets/bkash.webp";
import nagadLogo from "./assets/nagad.webp";
import rocketLogo from "./assets/rocket.webp";

/**
 * SendMoneyPopup — a faithful bKash / Nagad / Rocket / Bank "Send Money"
 * checkout popup for Bangladeshi manual-payment flows.
 *
 * ── Design goal ────────────────────────────────────────────────────────────
 * Drop-in, pixel-faithful popup: brand header strip, amount card, copy-able
 * receiver number (or the full bank account with one-tap copy-all), in-popup
 * wallet switcher, step-by-step instructions, and a validated reference input
 * (sender number for bKash/Nagad, TrxID for Rocket, TrxID/reference for bank).
 * Feature-for-feature parity with ../vanilla/send-money-popup.html, which stays
 * the canonical copy — when the two disagree, the vanilla file is right.
 *
 * ── Zero coupling ──────────────────────────────────────────────────────────
 * Depends ONLY on React. It knows nothing about your backend, router, or auth.
 * You wire it up through props:
 *   • onSubmit(provider, reference)  → call YOUR API; resolve to continue,
 *                                       throw an Error(message) to show a toast.
 *   • onClose()                      → close the popup (called after confirm).
 *   • onSwitch(provider)             → optional: the customer changed wallet
 *                                       inside the popup; sync your picker.
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

export type Provider = "bkash" | "nagad" | "rocket" | "bank";

/** The three mobile wallets. Bank is a transfer, not a wallet — it has no
 *  send-money app, no tab in the switcher, and its own reference rule. */
export type WalletProvider = "bkash" | "nagad" | "rocket";

export const WALLETS: WalletProvider[] = ["bkash", "nagad", "rocket"];

export const isWallet = (p: Provider): p is WalletProvider => p !== "bank";

export interface ProviderBrand {
  label: string; // native label shown in the UI (e.g. "বিকাশ")
  en: string; // english/alt name (alt text)
  brand: string; // primary brand color
  dark: string; // darker shade (gradients, accents)
  light: string; // light tint (backgrounds)
  logo?: string; // logo URL — omitted for bank, which draws an inline SVG tile
  /** true → reference is a Transaction ID (Rocket); false → sender phone number. */
  usesTrxId?: boolean;
}

/** Bank transfer receiver. `branch` and `routing_number` may be empty —
 *  their rows are skipped rather than rendered blank. */
export interface BankDetails {
  bank_name: string;
  account_name: string;
  account_number: string;
  branch?: string | null;
  routing_number?: string | null;
}

/** Default BD payment brands. Override any field via the `brands` prop. */
export const DEFAULT_BRANDS: Record<Provider, ProviderBrand> = {
  bkash:  { label: "বিকাশ", en: "bKash",  brand: "#E2136E", dark: "#b80e58", light: "#fcebf3", logo: bkashLogo },
  nagad:  { label: "নগদ",  en: "Nagad",  brand: "#F05921", dark: "#c94515", light: "#fff3ee", logo: nagadLogo },
  rocket: { label: "রকেট", en: "Rocket", brand: "#8C3494", dark: "#6b277a", light: "#f7eef9", logo: rocketLogo, usesTrxId: true },
  bank:   { label: "ব্যাংক", en: "Bank",   brand: "#2563eb", dark: "#1e40af", light: "#eaf1fe", usesTrxId: true },
};

// BD mobile: 11 digits starting 01 — deliberately silent about the operator
// digit. Operators reshuffle their ranges; a hardcoded 013–019 list starts
// rejecting real customers the day a new range opens. Mirror this server-side.
const PHONE_RE = /^01\d{9}$/;
const TRX_RE = /^[A-Za-z0-9]{10}$/; // MFS TrxID: 10 alphanumerics
// Bank references are the wild west — every bank prints a different shape
// (FT26AB12CD, 2026/00412, plain digits). Bound the length, allow the two
// separators banks actually use, and let the human verifier do the rest.
const BANK_RE = /^[A-Za-z0-9/-]{4,40}$/;

const toBn = (n: number | string) => String(n).replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[+d]);

/** Whole taka stay whole; a fractional amount shows its two decimals. */
const fmtAmount = (a: number | string) => {
  const n = typeof a === "number" ? a : parseFloat(String(a));
  if (!isFinite(n)) return toBn(String(a));
  return toBn(n % 1 === 0 ? String(n) : n.toFixed(2));
};

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

/* ─── Reopen-after-refresh storage ──────────────────────────────────────────
   A real buyer leaves to the bKash app to send the money and comes back — to a
   remounted page. Without this the popup is simply gone and the money is
   already sent. Keys are namespaced by popupKey (one per checkout page) and
   match the vanilla kit's exactly, so a project migrating vanilla → React does
   not strand drafts mid-payment. Every access is wrapped: Safari private mode
   throws on localStorage rather than returning null. */
export interface SendMoneyDraft {
  provider: Provider;
  amount: number;
  reference: string;
}

const lsKeys = (popupKey: string) => ({
  open: `dp_pay_open_${popupKey}`,
  ref: `dp_pay_ref_${popupKey}`,
  amount: `dp_pay_amt_${popupKey}`,
});

/** Read an in-progress payment saved before a refresh. Call this on mount in
 *  your checkout and reopen the popup with what it returns. */
export const readSendMoneyDraft = (popupKey: string): SendMoneyDraft | null => {
  if (!popupKey) return null;
  try {
    const k = lsKeys(popupKey);
    const provider = localStorage.getItem(k.open) as Provider | null;
    const amount = parseFloat(localStorage.getItem(k.amount) || "0");
    if (!provider || !(amount > 0)) return null;
    return { provider, amount, reference: localStorage.getItem(k.ref) || "" };
  } catch { return null; }
};

export const clearSendMoneyDraft = (popupKey: string) => {
  if (!popupKey) return;
  try {
    const k = lsKeys(popupKey);
    localStorage.removeItem(k.open);
    localStorage.removeItem(k.ref);
    localStorage.removeItem(k.amount);
  } catch { /* ignore */ }
};

/* ─── Popup-scoped CSS (all classes prefixed dp-* so nothing leaks) ─── */
const POPUP_CSS = `
/* The overlay is fixed and scrolls itself, so the page-level room reserved by
   keyboard-aware.js cannot reach inside — the kit hands the measurement over
   in --kb-reserve and this is where the popup spends it. Two jobs, one line: a
   card shorter than the overlay re-centres upward out of the keyboard's way
   (margin:auto redistributes), and a taller one gains exactly the scroll range
   needed to lift the reference field clear. !important because the center div
   carries inline padding. */
html[data-kb] .dp-center{padding-bottom:calc(max(24px,env(safe-area-inset-bottom,0px)) + var(--kb-reserve,0px)) !important;}
.dp-card{margin:auto;background:#fff;border-radius:28px;width:100%;max-width:440px;box-shadow:0 16px 40px rgba(0,0,0,.12);animation:dpSlideUp .4s cubic-bezier(.34,1.45,.64,1) forwards;position:relative;font-family:'Anek Bangla','Hind Siliguri',sans-serif;}
@keyframes dpSlideUp{from{opacity:0;transform:translateY(40px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.dp-strip{background:linear-gradient(135deg,var(--brand) 0%,var(--brand-dark) 100%);border-radius:28px 28px 0 0;padding:12px 14px;display:flex;align-items:center;gap:12px;position:relative;}
.dp-strip-logo{width:38px;height:38px;border-radius:12px;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:6px;object-fit:contain;flex-shrink:0;box-sizing:border-box;}
.dp-strip-logo.bank{background:linear-gradient(135deg,#2563eb,#1e40af);display:flex;align-items:center;justify-content:center;padding:0;}
.dp-strip-logo.bank svg{width:24px;height:24px;stroke:#fff;}
.dp-strip-name{font-size:15.5px;font-weight:800;color:#fff;line-height:1.2;white-space:nowrap;margin:0;}
.dp-strip-note{font-size:13px;font-weight:600;opacity:.9;}
.dp-strip-sub{font-size:12px;color:rgba(255,255,255,.85);margin:2px 0 0;}
.dp-close{position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,.18);color:#fff;font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.dp-close:hover{background:rgba(255,255,255,.3);}
.dp-body{padding:12px 14px 14px;}
.dp-tabs{display:flex;gap:8px;margin-bottom:10px;}
.dp-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:8px 4px;background:#fff;border:1.5px solid #cbd5e1;border-radius:12px;font-size:14px;font-weight:700;color:#475569;cursor:pointer;font-family:inherit;transition:all .2s;}
.dp-tab img{width:20px;height:20px;object-fit:contain;flex-shrink:0;}
.dp-tab.active{border-color:var(--brand);border-width:2px;color:var(--brand-dark);background:var(--brand-light);}
.dp-tab:not(.active):hover{border-color:#94a3b8;}
.dp-amount{background:var(--brand-light);border:1px solid rgba(0,0,0,.05);border-radius:14px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.dp-amount-left{display:flex;align-items:center;gap:10px;}
.dp-amount-icon{width:30px;height:30px;border-radius:10px;background:rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.dp-amount-icon svg{width:18px;height:18px;stroke:var(--brand-dark);}
.dp-amount-label-txt{font-size:14px;color:#475569;font-weight:700;}
.dp-amount-val{font-size:22px;font-weight:800;color:var(--brand-dark);letter-spacing:-.5px;}
.dp-num-lbl{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#334155;margin:0 0 6px;}
.dp-num-lbl svg{width:16px;height:16px;stroke:var(--brand);}
.dp-num-box{display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:14px;padding:9px 12px;margin-bottom:10px;}
.dp-num{font-size:19px;font-weight:800;color:#1e293b;letter-spacing:1px;}
.dp-bank{background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:14px;margin-bottom:10px;overflow:hidden;}
.dp-bank-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 12px;}
.dp-bank-row + .dp-bank-row{border-top:1px solid #e2e8f0;}
.dp-bank-lbl{font-size:11px;color:#64748b;font-weight:600;flex-shrink:0;}
.dp-bank-val{font-size:13px;font-weight:800;color:#1e293b;text-align:right;word-break:break-all;min-width:0;}
.dp-bank-val.mono{font-size:14px;letter-spacing:.5px;}
.dp-copy-all{width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;background:var(--brand-light);border:none;border-top:1px solid #e2e8f0;color:var(--brand-dark);font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;transition:all .2s;}
.dp-copy-all:hover{background:var(--brand);color:#fff;}
.dp-copy-all.copied{background:#10b981;color:#fff;}
.dp-copy-all svg{width:14px;height:14px;flex-shrink:0;}
.dp-copy{display:flex;align-items:center;gap:6px;background:var(--brand);border:none;border-radius:10px;padding:8px 14px;cursor:pointer;color:#fff;font-size:13px;font-weight:700;transition:all .2s;white-space:nowrap;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.15);}
.dp-copy:hover{background:var(--brand-dark);}
.dp-copy.copied{background:#10b981;box-shadow:0 2px 8px rgba(16,185,129,.3);}
.dp-copy svg{width:14px;height:14px;}
.dp-steps-ttl{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#334155;margin:0 0 6px;}
.dp-steps-ttl svg{width:16px;height:16px;stroke:var(--brand);}
.dp-steps{background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid var(--brand);border-radius:12px;padding:8px 12px;margin-bottom:10px;display:flex;flex-direction:column;gap:5px;}
.dp-step{display:flex;align-items:flex-start;gap:10px;font-size:12.5px;color:#334155;font-weight:600;line-height:1.4;}
.dp-step-n{background:var(--brand);color:#fff;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:800;flex-shrink:0;}
.dp-inp-lbl{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#334155;margin:0 0 6px;}
.dp-inp-lbl svg{width:16px;height:16px;stroke:var(--brand);}
/* scroll-margin-bottom: when the keyboard reveal scrolls this field into view
   — the browser's own scroll in Chrome, keyboard-aware.js's nudge in
   Facebook's WebView — bring the submit button below it along for the ride.
   Typing with the one button you need hidden behind the keyboard is most of
   what "the popup doesn't work in Facebook" means in practice. */
.dp-inp{width:100%;padding:10px 14px;background:#fff;border:2px solid #cbd5e1;border-radius:12px;font-size:16px;font-weight:700;color:#0f172a;outline:none;transition:border-color .2s;letter-spacing:1px;margin-bottom:10px;box-sizing:border-box;scroll-margin-bottom:72px;scroll-margin-top:32px;}
.dp-inp::placeholder{font-size:14px;letter-spacing:0;color:#94a3b8;font-weight:500;}
.dp-inp:focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-light);}
.dp-inp.error{border-color:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.15);animation:dpShake .4s ease;}
@keyframes dpShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
.dp-btn{width:100%;padding:12px;background:linear-gradient(135deg,var(--brand) 0%,var(--brand-dark) 100%);color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:800;cursor:pointer;transition:all .2s;box-shadow:0 6px 20px rgba(0,0,0,.15);font-family:inherit;}
.dp-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 25px rgba(0,0,0,.2);}
.dp-btn:disabled{opacity:.7;cursor:not-allowed;transform:none;}
.dp-btn.success{background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 6px 20px rgba(16,185,129,.3);}
.dp-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 24px;border-radius:50px;font-size:14px;font-weight:600;z-index:2147483647;white-space:nowrap;box-shadow:0 10px 30px rgba(0,0,0,.2);transition:bottom .15s ease;}
/* In hosts that let the keyboard cover the page (data-kb set), a toast pinned
   24px from the bottom is a toast shown to the keyboard. Lift it by the
   keyboard's height; where the browser resizes the page (Chrome), data-kb
   never appears and nothing moves. */
html[data-kb] .dp-toast{bottom:calc(24px + var(--kb-reserve,0px));}
.dp-confirm{position:absolute;inset:0;z-index:10;background:rgba(255,255,255,.96);border-radius:28px;display:flex;align-items:center;justify-content:center;padding:24px;}
.dp-confirm-box{text-align:center;max-width:300px;}
.dp-confirm-ttl{font-size:17px;font-weight:800;color:#0f172a;margin:0 0 8px;}
.dp-confirm-msg{font-size:13.5px;color:#475569;font-weight:500;line-height:1.5;margin:0 0 16px;}
.dp-confirm-row{display:flex;gap:10px;justify-content:center;}
.dp-confirm-yes{background:#ef4444;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;}
.dp-confirm-no{background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:10px;padding:10px 16px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;}
`;

/* Inline SVG icons (no icon-library dependency) */
const IconWallet = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
);
const IconBank = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M4 18h16M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 3 3 8h18L12 3z" /></svg>
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
  headerSuffix?: string; // after the brand label, wallets (e.g. "সেন্ড মানি করুন")
  headerNote?: string; // small parenthetical after it ("(পার্সোনাল)"); "" hides it
  headerSuffixBank?: string; // after the brand label, bank ("ট্রান্সফার করুন")
  brandSubtitle?: string; // small line under the header title
  amountLabel?: string;
  receiverLabel?: string; // wallets: "যে নম্বরে টাকা পাঠাবেন"
  receiverLabelBank?: string; // bank: "যে অ্যাকাউন্টে টাকা পাঠাবেন"
  copy?: string;
  copied?: string;
  copyAll?: string;
  copiedAll?: string;
  stepsTitle?: string;
  step1?: string; // wallets, HTML allowed
  step1Bank?: string;
  step2?: (brandLabel: string) => string; // wallets, HTML allowed
  step2Bank?: string;
  step3Phone?: string; // wallets taking a sender number
  step3Trx?: string; // rocket / bank
  inputLabelPhone?: string;
  inputLabelTrx?: string;
  inputLabelBank?: string;
  placeholderPhone?: string;
  placeholderTrx?: string;
  placeholderBank?: string;
  bankRowLabels?: { bank?: string; holder?: string; account?: string; branch?: string; routing?: string };
  submit?: string;
  submitting?: string;
  submitted?: string;
  confirmTitle?: string;
  confirmMessage?: string;
  confirmYes?: string;
  confirmNo?: string;
  toastCopied?: string;
  toastCopiedAll?: string;
  errorPhone?: string;
  errorTrx?: string;
  errorBank?: string;
  errorGeneric?: string;
}

const DEFAULT_LABELS: Required<Omit<SendMoneyPopupLabels, "bankRowLabels">> & {
  bankRowLabels: Required<NonNullable<SendMoneyPopupLabels["bankRowLabels"]>>;
} = {
  headerSuffix: "সেন্ড মানি করুন",
  headerNote: "(পার্সোনাল)",
  headerSuffixBank: "ট্রান্সফার করুন",
  brandSubtitle: "নিরাপদ পেমেন্ট",
  amountLabel: "মোট পরিমাণ",
  receiverLabel: "যে নম্বরে টাকা পাঠাবেন",
  receiverLabelBank: "যে অ্যাকাউন্টে টাকা পাঠাবেন",
  copy: "কপি করুন",
  copied: "কপি হয়েছে ✓",
  copyAll: "সব তথ্য কপি করুন",
  copiedAll: "কপি হয়েছে ✓",
  stepsTitle: "কীভাবে টাকা পাঠাবেন",
  step1: "উপরের নম্বরটি <strong>কপি</strong> করুন",
  step1Bank: "উপরের <strong>অ্যাকাউন্ট নম্বর</strong> কপি করুন",
  step2: (b) => `${b} অ্যাপ থেকে <strong>Send Money</strong> করুন`,
  step2Bank: "ব্যাংক অ্যাপ / ব্রাঞ্চ থেকে <strong>ট্রান্সফার</strong> করুন",
  step3Phone: "নিচে <strong>আপনার নম্বর</strong> লিখে জমা দিন",
  step3Trx: "নিচে <strong>Transaction ID</strong> লিখে জমা দিন",
  inputLabelPhone: "আপনি যে নম্বর থেকে টাকা পাঠিয়েছেন",
  inputLabelTrx: "আপনার Transaction ID (TrxID)",
  inputLabelBank: "ট্রানজেকশন আইডি / রেফারেন্স",
  placeholderPhone: "01XXXXXXXXX",
  placeholderTrx: "TRXID দিন",
  placeholderBank: "যেমন: FT26AB12CD",
  bankRowLabels: {
    bank: "ব্যাংক",
    holder: "অ্যাকাউন্ট হোল্ডার",
    account: "অ্যাকাউন্ট নম্বর",
    branch: "ব্রাঞ্চ",
    routing: "রাউটিং নম্বর",
  },
  submit: "সাবমিট করুন",
  submitting: "জমা হচ্ছে...",
  submitted: "✅ সফলভাবে জমা হয়েছে!",
  confirmTitle: "পেমেন্ট বন্ধ করবেন?",
  confirmMessage: "আপনি কি নিশ্চিত পেমেন্ট প্রক্রিয়া বন্ধ করতে চান? আপনার দেওয়া তথ্য মুছে যাবে।",
  confirmYes: "হ্যাঁ, বন্ধ করুন",
  confirmNo: "না, চালিয়ে যাই",
  toastCopied: "✅ নম্বর কপি হয়েছে!",
  toastCopiedAll: "✅ সব তথ্য কপি হয়েছে!",
  errorPhone: "সঠিক মোবাইল নম্বর দিন (১১ সংখ্যা)",
  errorTrx: "সঠিক ১০ অক্ষরের Transaction ID দিন",
  errorBank: "সঠিক ট্রানজেকশন আইডি / রেফারেন্স দিন (৪–৪০ অক্ষর)",
  errorGeneric: "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।",
};

export interface SendMoneyPopupProps {
  /** Which method the popup opens on. The customer may switch wallets from
   *  inside it (see `onSwitch`); bank is a one-way door with no tabs. */
  provider: Provider;
  /** Amount to display (Bangla digits, ৳ prefix; decimals only when needed). */
  amount: number | string;
  /**
   * Your merchant (receiver) wallet numbers. Supplying more than one turns on
   * the in-popup wallet switcher. Legacy single-wallet callers can keep using
   * `receiverNumber` instead — it is treated as the number for `provider`.
   */
  receivers?: Partial<Record<WalletProvider, string | null | undefined>>;
  /** @deprecated Pass `receivers` — a lone number means no wallet switcher. */
  receiverNumber?: string;
  /** Bank transfer receiver. Required to open the popup on `bank`. */
  bank?: BankDetails | null;
  /**
   * Called when the customer submits their reference: a sender phone number
   * (bKash/Nagad), a TrxID (Rocket) or a transaction id / reference (bank).
   * Return a Promise — resolve to show the success state, or throw
   * new Error(msg) to surface `msg` in a toast and keep the popup open.
   */
  onSubmit: (provider: Provider, reference: string) => Promise<void> | void;
  /** Close the popup (invoked after the built-in confirm, or after success). */
  onClose: () => void;
  /** The customer switched wallet inside the popup — sync your own picker. */
  onSwitch?: (provider: Provider) => void;
  brands?: Partial<Record<Provider, ProviderBrand>>;
  labels?: SendMoneyPopupLabels;
  /** Last-used sender number per wallet — prefills for a returning buyer. */
  senderPrefill?: Partial<Record<WalletProvider, string>>;
  /** Seeds the reference field (e.g. a draft restored after a refresh). */
  initialReference?: string;
  /**
   * Namespaces the reopen-after-refresh storage; give each distinct checkout
   * page its own key (e.g. the order id). Omit to disable persistence.
   * Read it back with readSendMoneyDraft(popupKey) when your checkout mounts.
   */
  popupKey?: string;
  /** Skip the "are you sure?" confirmation when closing. Default: false. */
  skipCloseConfirm?: boolean;
  /** Optional: fired once a submit succeeds (e.g. analytics). */
  onSuccess?: (provider: Provider, reference: string) => void;
  /** ms to keep the success state before onClose is auto-called. 0 = manual. */
  autoCloseMs?: number;
}

export function SendMoneyPopup({
  provider, amount, receivers, receiverNumber, bank, onSubmit, onClose, onSwitch,
  brands, labels, senderPrefill, initialReference, popupKey,
  skipCloseConfirm = false, onSuccess, autoCloseMs = 1300,
}: SendMoneyPopupProps) {
  const t = { ...DEFAULT_LABELS, ...labels, bankRowLabels: { ...DEFAULT_LABELS.bankRowLabels, ...labels?.bankRowLabels } };
  const brandMap = brands ? { ...DEFAULT_BRANDS, ...brands } : DEFAULT_BRANDS;
  const prefill = senderPrefill ?? {};

  // A lone receiverNumber is the legacy single-wallet API; fold it into the
  // same map so everything below has exactly one shape to read.
  const numbers = useMemo<Partial<Record<WalletProvider, string | null | undefined>>>(
    () => (receivers ?? (receiverNumber && isWallet(provider) ? { [provider]: receiverNumber } : {})),
    [receivers, receiverNumber, provider],
  );

  // Which method the popup is showing right now. Seeded by the prop, then
  // owned here so the wallet tabs can change it without a round-trip through
  // the host (onSwitch keeps the host's picker in step).
  const [active, setActive] = useState<Provider>(provider);
  useEffect(() => { setActive(provider); }, [provider]);

  const isBank = active === "bank";
  const b = brandMap[active];
  // Rocket and bank both take a typed reference rather than a phone number;
  // only their validation rule and copy differ.
  const isTrx = isBank || !!b.usesTrxId;

  const [ref, setRef] = useState(
    () => initialReference || (isWallet(provider) && !brandMap[provider].usesTrxId ? prefill[provider] || "" : ""),
  );
  const [err, setErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
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

  // Lock background scroll while open. The buyer leaves for the wallet app and
  // comes back — the page underneath must not have scrolled away meanwhile.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* Persist the in-progress payment (see SendMoneyDraft above). */
  useEffect(() => {
    if (!popupKey || done) return;
    try {
      const k = lsKeys(popupKey);
      localStorage.setItem(k.open, active);
      localStorage.setItem(k.amount, String(amount));
    } catch { /* ignore */ }
  }, [popupKey, active, amount, done]);

  useEffect(() => {
    if (!popupKey || done) return;
    try { localStorage.setItem(lsKeys(popupKey).ref, ref); } catch { /* ignore */ }
  }, [popupKey, ref, done]);

  const wallets = WALLETS.filter((w) => !!numbers[w]);
  // One wallet needs no switcher, and bank is a different flow with its own
  // dedicated door — no tabs back out of it.
  const showTabs = wallets.length > 1 && !isBank;

  /* Bank rows, in the order a buyer fills them into the bank app. One tap
     hands over the whole thing, labels included — ready to paste into the
     app's notes or a message to whoever does the transfer. Copying field by
     field is the exception, not the rule. */
  const bankRows = useMemo(() => {
    if (!bank) return [] as { label: string; value: string; mono: boolean }[];
    return [
      { label: t.bankRowLabels.bank, value: bank.bank_name, mono: false },
      { label: t.bankRowLabels.holder, value: bank.account_name, mono: false },
      { label: t.bankRowLabels.account, value: bank.account_number, mono: true },
      { label: t.bankRowLabels.branch, value: bank.branch || "", mono: false },
      { label: t.bankRowLabels.routing, value: bank.routing_number || "", mono: true },
    ].filter((r) => !!r.value);
  }, [bank, t.bankRowLabels]);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };

  const requestClose = () => {
    if (busy || done) return;
    if (skipCloseConfirm) { if (popupKey) clearSendMoneyDraft(popupKey); onClose(); return; }
    setConfirming(true);
  };

  const confirmClose = () => {
    if (popupKey) clearSendMoneyDraft(popupKey);
    onClose();
  };

  /* Clipboard, with the legacy execCommand fallback old in-app browsers
     still need. */
  const copyText = (text: string, after: (ok: true) => void, toastMsg: string) => {
    const legacy = () => {
      const i = document.createElement("input");
      i.value = text; document.body.appendChild(i); i.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(i);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(legacy);
    else legacy();
    after(true);
    showToast(toastMsg);
  };

  const copyNumber = () => {
    const n = numbers[active as WalletProvider];
    if (!n) return;
    copyText(n, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }, t.toastCopied);
  };

  const copyAllBank = () => {
    copyText(bankRows.map((r) => `${r.label}: ${r.value}`).join("\n"), () => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    }, t.toastCopiedAll);
  };

  /* Balance short in the first wallet? Switch here without starting over. The
     typed sender number survives bKash↔Nagad (same kind of reference); Rocket
     wants a TrxID instead, so it starts clean. */
  const switchTo = (next: WalletProvider) => {
    if (next === active || busy || done) return;
    const phoneLike = (p: Provider) => p === "bkash" || p === "nagad";
    const keep = phoneLike(active) && phoneLike(next) ? ref : "";
    setActive(next);
    setRef(keep || (next === "rocket" ? "" : prefill[next] || ""));
    setErr(false);
    onSwitch?.(next);
  };

  const submit = async () => {
    // One last normalize catches a paste whose compositionend never fired.
    const v = normalizeIfPhone(ref.trim());
    const ok = isBank ? BANK_RE.test(v) : isTrx ? TRX_RE.test(v) : PHONE_RE.test(v);
    if (!ok) {
      setErr(true);
      showToast(isBank ? t.errorBank : isTrx ? t.errorTrx : t.errorPhone);
      setTimeout(() => setErr(false), 1600);
      return;
    }
    const value = isTrx ? v.toUpperCase() : v;
    setBusy(true);
    try {
      await onSubmit(active, value);
      setDone(true);
      if (popupKey) clearSendMoneyDraft(popupKey);
      onSuccess?.(active, value);
      if (autoCloseMs > 0) setTimeout(onClose, autoCloseMs);
    } catch (e: any) {
      setBusy(false);
      showToast(e?.message || t.errorGeneric);
    }
  };

  const receiver = numbers[active as WalletProvider];

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,12,24,.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", overflowY: "auto", overscrollBehavior: "contain", zIndex: 2147483000 }}>
      <div className="dp-center" style={{ display: "flex", minHeight: "100%", padding: "16px", paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))" }}>
        <style>{POPUP_CSS}</style>
        <div className="dp-card" style={{ ["--brand" as any]: b.brand, ["--brand-dark" as any]: b.dark, ["--brand-light" as any]: b.light }}>
          {/* Header strip */}
          <div className="dp-strip">
            {isBank
              ? <span className="dp-strip-logo bank"><IconBank /></span>
              : <img src={b.logo} alt={b.en} className="dp-strip-logo" />}
            <div>
              <p className="dp-strip-name">
                {b.label} {isBank ? t.headerSuffixBank : t.headerSuffix}
                {!isBank && t.headerNote ? <> <span className="dp-strip-note">{t.headerNote}</span></> : null}
              </p>
              <p className="dp-strip-sub">{t.brandSubtitle}</p>
            </div>
            <button type="button" className="dp-close" onClick={requestClose} disabled={busy || done} aria-label="বন্ধ করুন">✕</button>
          </div>

          <div className="dp-body">
            {/* Wallet switcher */}
            {showTabs && (
              <div className="dp-tabs">
                {wallets.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`dp-tab${active === w ? " active" : ""}`}
                    onClick={() => switchTo(w)}
                    disabled={busy || done}
                  >
                    <img src={brandMap[w].logo} alt="" width={20} height={20} />
                    <span>{brandMap[w].label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Amount */}
            <div className="dp-amount">
              <div className="dp-amount-left">
                <div className="dp-amount-icon"><IconWallet /></div>
                <span className="dp-amount-label-txt">{t.amountLabel}</span>
              </div>
              <span className="dp-amount-val">৳{fmtAmount(amount)}</span>
            </div>

            {/* Receiver — a wallet number, or the full bank account */}
            {isBank ? (
              <>
                <p className="dp-num-lbl"><IconBank /> {t.receiverLabelBank}</p>
                <div className="dp-bank">
                  {bankRows.map((r) => (
                    <div className="dp-bank-row" key={r.label}>
                      <span className="dp-bank-lbl">{r.label}</span>
                      <span className={`dp-bank-val${r.mono ? " mono" : ""}`}>{r.value}</span>
                    </div>
                  ))}
                  <button type="button" className={`dp-copy-all${copiedAll ? " copied" : ""}`} onClick={copyAllBank}>
                    <IconCopy /><span>{copiedAll ? t.copiedAll : t.copyAll}</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="dp-num-lbl"><IconPhone /> {t.receiverLabel}</p>
                <div className="dp-num-box">
                  <span className="dp-num">{receiver}</span>
                  <button type="button" className={`dp-copy${copied ? " copied" : ""}`} onClick={copyNumber}>
                    <IconCopy /><span>{copied ? t.copied : t.copy}</span>
                  </button>
                </div>
              </>
            )}

            {/* Steps */}
            <p className="dp-steps-ttl"><IconSteps /> {t.stepsTitle}</p>
            <div className="dp-steps">
              <div className="dp-step"><span className="dp-step-n">১</span><span dangerouslySetInnerHTML={{ __html: isBank ? t.step1Bank : t.step1 }} /></div>
              <div className="dp-step"><span className="dp-step-n">২</span><span dangerouslySetInnerHTML={{ __html: isBank ? t.step2Bank : t.step2(b.label) }} /></div>
              <div className="dp-step"><span className="dp-step-n">৩</span><span dangerouslySetInnerHTML={{ __html: isTrx ? t.step3Trx : t.step3Phone }} /></div>
            </div>

            {/* Reference input */}
            <label className="dp-inp-lbl">
              {isTrx ? <IconLock /> : <IconPhone />}
              {isBank ? t.inputLabelBank : isTrx ? t.inputLabelTrx : t.inputLabelPhone}
            </label>
            <input
              className={`dp-inp${err ? " error" : ""}`}
              type={isTrx ? "text" : "tel"}
              inputMode={isTrx ? undefined : "numeric"}
              /* Wallets get generous paste room, not 11: a buyer pastes
                 "+880 1712-345678" (16 chars) and the browser enforces
                 maxLength BEFORE the normalizer ever sees it — clip it here
                 and a valid number arrives mangled and gets rejected. The
                 normalizer is the real cap; it trims to 11 digits on commit. */
              maxLength={isBank ? 40 : isTrx ? 10 : 20}
              placeholder={isBank ? t.placeholderBank : isTrx ? t.placeholderTrx : t.placeholderPhone}
              style={isTrx ? { textTransform: "uppercase" } : undefined}
              autoComplete="off"
              value={ref}
              onChange={(e) => {
                const raw = e.target.value;
                const mid = imeOpen.current || (e.nativeEvent as InputEvent).isComposing;
                setRef(mid ? raw : normalizeIfPhone(raw));
                setErr(false);
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

          {/* Close confirmation — a stray tap must not discard a half-typed
              reference for money already sent. */}
          {confirming && (
            <div className="dp-confirm">
              <div className="dp-confirm-box">
                <p className="dp-confirm-ttl">{t.confirmTitle}</p>
                <p className="dp-confirm-msg">{t.confirmMessage}</p>
                <div className="dp-confirm-row">
                  <button type="button" className="dp-confirm-yes" onClick={confirmClose}>{t.confirmYes}</button>
                  <button type="button" className="dp-confirm-no" onClick={() => setConfirming(false)}>{t.confirmNo}</button>
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

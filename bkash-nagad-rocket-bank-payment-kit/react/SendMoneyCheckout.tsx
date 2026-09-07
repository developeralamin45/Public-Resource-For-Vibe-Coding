import { useEffect, useState } from "react";
import { SendMoneyPopup, DEFAULT_BRANDS, WALLETS, readSendMoneyDraft } from "./SendMoneyPopup";
import type {
  BankDetails, Provider, ProviderBrand, SendMoneyPopupLabels, WalletProvider,
} from "./SendMoneyPopup";

/**
 * SendMoneyCheckout — the full flow: a method picker (bKash / Nagad / Rocket /
 * Bank, with logos + a "selected" checkmark) plus a pay button that opens the
 * faithful <SendMoneyPopup>. This is the "same to same" experience end-to-end.
 *
 * Use this when you want the whole picker. If you only need the popup (you have
 * your own method selector), import <SendMoneyPopup> directly instead.
 *
 * Styling here uses plain inline styles + a tiny scoped stylesheet so it works
 * with OR without Tailwind. Swap freely to match your design system.
 */

const toBn = (n: number | string) => String(n).replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[+d]);

const PICKER_CSS = `
.smc-wrap{max-width:440px;margin:0 auto;font-family:'Anek Bangla','Hind Siliguri',sans-serif;}
.smc-ttl{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;color:#1e293b;margin:0 0 12px;}
.smc-ttl-bar{width:4px;height:20px;border-radius:3px;background:linear-gradient(180deg,#6366f1,#8b5cf6);}
/* auto-fit, not a fixed 3: the picker shows three methods when the merchant
   has no bank account and four when it does, and drops to fewer columns on a
   narrow phone rather than squeezing every tile. */
.smc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:12px;}
.smc-opt{position:relative;border:2px solid #e2e8f0;background:#fff;border-radius:16px;padding:16px 8px 12px;text-align:center;cursor:pointer;transition:all .3s;font-family:inherit;}
.smc-opt:hover{border-color:#cbd5e1;transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.08);}
.smc-opt.active{border-color:#3b82f6;background:#eff6ff;box-shadow:0 0 0 4px rgba(59,130,246,.15),0 8px 24px rgba(59,130,246,.25);transform:translateY(-4px);}
.smc-check{position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;background:#3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(59,130,246,.4);}
.smc-check svg{width:13px;height:13px;}
.smc-logo{width:48px;height:48px;object-fit:contain;border-radius:12px;margin:0 auto 8px;display:block;transition:transform .3s;}
/* Bank has no logo to license — it gets the same 48px tile drawn in-house. */
.smc-logo.bank{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#2563eb,#1e40af);box-shadow:0 4px 12px rgba(37,99,235,.3);}
.smc-logo.bank svg{width:26px;height:26px;stroke:#fff;}
.smc-opt.active .smc-logo{transform:scale(1.05);}
.smc-name{display:block;font-size:14px;font-weight:800;color:#64748b;}
.smc-opt.active .smc-name{color:#1d4ed8;}
.smc-bar{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:20px;padding:15px;border-radius:16px;color:#fff;font-size:17px;font-weight:800;cursor:pointer;border:none;font-family:inherit;background:linear-gradient(90deg,#6366f1,#8b5cf6,#0ea5e9);box-shadow:0 12px 30px rgba(99,102,241,.4);transition:transform .15s;}
.smc-bar:hover{transform:translateY(-2px);}
.smc-bar:active{transform:scale(.98);}
.smc-bar:disabled{opacity:.55;cursor:not-allowed;}
`;

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);
const BankTileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M4 18h16M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 3 3 8h18L12 3z" /></svg>
);

export interface SendMoneyCheckoutProps {
  amount: number | string;
  /** Receiver wallet number per provider. A wallet with no number is hidden. */
  receivers: Partial<Record<WalletProvider, string | null | undefined>>;
  /** Bank transfer receiver. Omit (or null) and the bank method never shows. */
  bank?: BankDetails | null;
  /** Called on submit — wire to YOUR API. Throw new Error(msg) to show a toast. */
  onSubmit: (provider: Provider, reference: string) => Promise<void> | void;
  /** Fired after a successful submit (navigate, analytics, etc.). */
  onSuccess?: (provider: Provider, reference: string) => void;
  pickerTitle?: string;
  payButtonLabel?: string; // default: "পেমেন্ট সম্পন্ন করুন ৳{amount}"
  brands?: Partial<Record<Provider, ProviderBrand>>;
  popupLabels?: SendMoneyPopupLabels;
  /** Methods to show, in order. Default: the wallets you gave a number to,
   *  then bank when `bank` is supplied. */
  providers?: Provider[];
  /** Last-used sender number per wallet — prefills for a returning buyer. */
  senderPrefill?: Partial<Record<WalletProvider, string>>;
  /**
   * Namespaces the reopen-after-refresh storage; give each distinct checkout
   * page its own key (e.g. the order id). Omit to disable persistence.
   * With it set, a payment interrupted by a refresh — or by the trip to the
   * wallet app to actually send the money — comes back with the popup, the
   * method, the amount and the half-typed reference intact.
   */
  popupKey?: string;
}

export function SendMoneyCheckout({
  amount, receivers, bank, onSubmit, onSuccess,
  pickerTitle = "পেমেন্ট মেথড বেছে নিন",
  payButtonLabel,
  brands,
  popupLabels,
  providers,
  senderPrefill,
  popupKey,
}: SendMoneyCheckoutProps) {
  const brandMap = brands ? { ...DEFAULT_BRANDS, ...brands } : DEFAULT_BRANDS;

  // Offer only what the merchant can actually receive on.
  const available: Provider[] = providers ?? [
    ...WALLETS.filter((w) => !!receivers[w]),
    ...(bank ? (["bank"] as Provider[]) : []),
  ];

  const [method, setMethod] = useState<Provider>(available[0] ?? "bkash");
  const [open, setOpen] = useState(false);
  const [restoredRef, setRestoredRef] = useState("");

  /* Reopen an in-progress payment. The buyer who left for the bKash app and
     came back to a remounted page has already sent the money — losing the
     popup here means losing the claim. */
  useEffect(() => {
    if (!popupKey) return;
    const draft = readSendMoneyDraft(popupKey);
    if (!draft || !available.includes(draft.provider)) return;
    setMethod(draft.provider);
    setRestoredRef(draft.reference);
    setOpen(true);
    // Restore once, on mount — a later re-render must not reopen a popup the
    // buyer has since closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupKey]);

  const canPay = method === "bank" ? !!bank : !!receivers[method as WalletProvider];
  const payLabel = payButtonLabel ?? `পেমেন্ট সম্পন্ন করুন ৳${toBn(amount)}`;

  return (
    <div className="smc-wrap">
      <style>{PICKER_CSS}</style>

      <p className="smc-ttl"><span className="smc-ttl-bar" /> {pickerTitle}</p>
      <div className="smc-grid">
        {available.map((key) => {
          const active = method === key;
          const brand = brandMap[key];
          return (
            <button key={key} type="button" className={`smc-opt${active ? " active" : ""}`} onClick={() => setMethod(key)}>
              {active && <span className="smc-check"><CheckIcon /></span>}
              {key === "bank"
                ? <span className="smc-logo bank"><BankTileIcon /></span>
                : <img src={brand.logo} alt={brand.en} className="smc-logo" />}
              <span className="smc-name">{brand.en}</span>
            </button>
          );
        })}
      </div>

      <button type="button" className="smc-bar" disabled={!canPay} onClick={() => canPay && setOpen(true)}>
        <LockIcon /> {payLabel}
      </button>

      {open && canPay && (
        <SendMoneyPopup
          provider={method}
          amount={amount}
          receivers={receivers}
          bank={bank}
          brands={brands}
          labels={popupLabels}
          senderPrefill={senderPrefill}
          initialReference={restoredRef}
          popupKey={popupKey}
          onSubmit={onSubmit}
          onSuccess={onSuccess}
          /* The customer switched wallet inside the popup — keep the picker
             behind it in step, so closing does not snap back to the old one. */
          onSwitch={(next) => { setMethod(next); setRestoredRef(""); }}
          onClose={() => { setOpen(false); setRestoredRef(""); }}
        />
      )}
    </div>
  );
}

export default SendMoneyCheckout;

# 🇧🇩 bKash · Nagad · Rocket · Bank — Send-Money Checkout Kit

A drop-in, **pixel-faithful** manual-payment checkout for Bangladeshi apps:
method picker + a beautiful "Send Money" popup for **four methods** — bKash,
Nagad, Rocket and bank transfer. Copy-able receiver number (or one-tap
copy-all bank details), wallet switching inside the popup, refresh-proof
in-progress payments, validated sender-number / TrxID input — and a
battle-tested **soft-keyboard & Bangla-IME survival kit** for the browser your
buyers actually arrive in: Facebook's.

**Vanilla JS master copy + React/TypeScript variant · zero dependencies · MIT licensed.**

---

## Why this exists

Almost every Bangladeshi SaaS / e-commerce app needs the same manual-payment
flow: pick a wallet → see a send-money popup → submit the sender number or
TrxID. Rebuilding it (and re-sourcing the logos, and re-discovering why the
input disappears behind the keyboard in Facebook's in-app browser) every time
is wasted work. This is the **master copy** you hand to your project — or your
AI agent — once. It is kept in sync with a production checkout that takes real
payments every day.

## Two ways to use it

### 🤖 Hand it to your AI agent (recommended)

Point your coding agent at this folder and say:

> "Read this kit and implement the bKash/Nagad/Rocket/Bank send-money checkout
> in my project, same to same. Follow RECIPE.md. Wire the submit callback to my
> payment-claim endpoint."

The agent reads [`RECIPE.md`](./RECIPE.md), picks the right variant for your
stack, copies the pieces, and adapts the seams (merchant numbers, endpoint,
app name) — no redesign, no re-sourcing assets.

### 🧑‍💻 Copy the files

- **Any stack (the master copy):** paste `vanilla/send-money-popup.html` into
  your checkout page, load `vanilla/bd-phone.js` + `vanilla/keyboard-aware.js`,
  fill the `DP_CONFIG` block. Done.
- **React:** copy `react/` and render `<SendMoneyCheckout />` (three wallets;
  see RECIPE §2 for what to port from `vanilla/` if you need bank/tabs).

## What's in the box

```
RECIPE.md                        ← implementation brief (for humans AND AI agents)
LICENSE                          ← MIT
vanilla/                         ← the production-faithful MASTER COPY (any stack)
├── send-money-popup.html        ← 4 methods, wallet tabs, refresh-restore, prefill
├── keyboard-aware.js            ← soft-keyboard survival kit (page-level, framework-agnostic)
├── bd-phone.js                  ← BD phone smart-normalizer (Bangla-IME safe)
└── assets/{bkash,nagad,rocket}.webp
react/                           ← React + TypeScript variant (wallet flow)
├── SendMoneyPopup.tsx           ← the core popup (self-contained)
├── SendMoneyCheckout.tsx        ← picker + pay bar + popup (full flow)
├── assets/{bkash,nagad,rocket}.webp
├── assets.d.ts                  ← .webp TypeScript shim
└── demo/App.tsx                 ← runnable usage example
```

## The features you can't screenshot

- **Facebook in-app browser keyboard fix** — Facebook's WebView lets the
  keyboard cover the page without resizing it, and often without firing a
  single `visualViewport` event. `keyboard-aware.js` measures the keyboard
  itself (heartbeat while a field is focused), reserves scroll room, and lifts
  the field — and the submit button under it — clear. In Chrome it verifiably
  does nothing at all.
- **Bangla IME safety** — no rewriting the field mid-composition (that's how
  ০১৭ becomes ০১৭১), normalization on commit, and insurance for the WebView
  that swallows `compositionend`.
- **Smart paste** — `+8801712-345678`, `০১৭১২৩৪৫৬৭৮`, `8801…` all become
  `01712345678` before validation.
- **Refresh-proof** — popup, wallet, amount and the half-typed reference
  survive a refresh or a trip to the wallet app.
- **Wallet switching in-popup** — balance short in bKash? Switch to Nagad
  without starting over; the typed sender number survives.
- **Keyboard's enter key submits** — the one control the keyboard can't cover.

## Notes

- **Not affiliated** with bKash, Nagad, or Rocket. Logos are the property of
  their respective owners and are included only to identify the payment method,
  as is standard for checkout UIs. Remove/replace them if your use requires it.
- Validation runs client-side for UX — **always re-validate on your server**
  and never trust the client with amounts or merchant numbers.

## License

MIT — use it anywhere, including commercial projects. Attribution appreciated
but not required.

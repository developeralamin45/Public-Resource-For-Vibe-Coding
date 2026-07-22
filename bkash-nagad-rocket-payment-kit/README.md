# 🇧🇩 bKash · Nagad · Rocket — Send-Money Checkout Kit

A drop-in, **pixel-faithful** manual-payment (MFS) checkout for Bangladeshi apps:
a bKash / Nagad / Rocket method picker + a beautiful, responsive "Send Money"
popup. Copy-able receiver number, step-by-step instructions, sender-number /
TrxID validation, and a clean success state.

**React + TypeScript · zero dependencies beyond React · MIT licensed · free for anyone to use.**

![providers: bKash, Nagad, Rocket](react/assets/bkash.webp)

---

## Why this exists

Almost every Bangladeshi SaaS / e-commerce app needs the same manual-payment
flow: pick bKash/Nagad/Rocket → see a send-money popup → submit the sender number
or TrxID. Rebuilding it (and re-sourcing the logos) every time is wasted work.
This is a **master copy** you hand to your project — or your AI agent — once.

## Two ways to use it

### 🧑‍💻 Copy the files
Copy `react/` into your project and render `<SendMoneyCheckout />`. See
[`RECIPE.md`](./RECIPE.md) §4 for the 6-line integration.

### 🤖 Hand it to your AI agent
Point your coding agent at this repo (or paste [`RECIPE.md`](./RECIPE.md)) and say:

> "Implement this bKash/Nagad/Rocket send-money checkout in my project, same to
> same. Follow RECIPE.md. Wire `onSubmit` to my payment-claim endpoint."

The agent reads the recipe, copies the component + logos, and adapts the seams
(merchant numbers, endpoint, labels) to your stack — no redesign, no re-sourcing
assets.

## Quick start

```tsx
import { SendMoneyCheckout } from "./react/SendMoneyCheckout";

<SendMoneyCheckout
  amount={490}
  receivers={{ bkash: "017...", nagad: "018...", rocket: "019..." }}
  onSubmit={async (provider, reference) => {
    await fetch("/api/payment-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, reference }),
    });
  }}
  onSuccess={() => { /* navigate to your thank-you / register page */ }}
/>
```

Only want the popup (you have your own picker)? Import `SendMoneyPopup` instead.

## What's in the box

```
RECIPE.md                    ← implementation guide (for humans AND AI agents)
LICENSE                      ← MIT
react/
├── SendMoneyPopup.tsx       ← the core popup (self-contained)
├── SendMoneyCheckout.tsx    ← picker + pay bar + popup (full flow)
├── assets/{bkash,nagad,rocket}.webp   ← the logos, bundled — no re-sourcing
├── assets.d.ts              ← .webp TypeScript shim
└── demo/App.tsx             ← runnable usage example
```

## Props at a glance

| Prop | Purpose |
|---|---|
| `amount` | amount to display (auto Bangla digits + ৳) |
| `receivers` | your merchant number per provider |
| `onSubmit(provider, reference)` | wire to your API; `throw new Error(msg)` → toast |
| `onSuccess(provider, reference)` | navigate / analytics after success |
| `brands`, `popupLabels`, `providers`, `pickerTitle`, `payButtonLabel` | full customization |

Full details, backend contract, and gotchas: [`RECIPE.md`](./RECIPE.md).

## Notes

- **Not affiliated** with bKash, Nagad, or Rocket. Logos are the property of their
  respective owners and are included only to identify the payment method, as is
  standard for checkout UIs. Remove/replace them if your use requires it.
- Validation runs client-side for UX — **always re-validate on your server** and
  never trust the client with amounts or merchant numbers.

## License

MIT — use it anywhere, including commercial projects. Attribution appreciated but
not required.

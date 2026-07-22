# RECIPE — bKash / Nagad / Rocket Send-Money Checkout

> **For the AI agent implementing this in another project.** Read this top to
> bottom, then adapt to the host project's stack. The goal is a **pixel-faithful
> copy** of the payment method picker + send-money popup, wired to the host
> project's own backend. Do **not** redesign the UI — keep it "same to same".

---

## 1. What this is

A Bangladeshi manual-payment (MFS) checkout:

1. A 3-up **method picker** — bKash / Nagad / Rocket, each with its real logo and
   a "selected" checkmark.
2. A **send-money popup** — brand header strip, amount card, copy-able receiver
   number, step-by-step instructions, and a validated reference input:
   - bKash / Nagad → the customer's **sender phone number** (`01[3-9]xxxxxxxx`).
   - Rocket → a **Transaction ID** (10 alphanumerics).
3. On submit, the reference is handed to **your backend** (via `onSubmit`), which
   records the claim; an admin later verifies the money and unlocks whatever the
   payment was for.

It is intentionally **backend-agnostic**. The kit does UI + validation + UX only.

## 2. Files to copy

Copy the whole `react/` folder into the host project (e.g. to
`src/components/payment/`):

```
SendMoneyPopup.tsx      ← the core popup (import this if you have your own picker)
SendMoneyCheckout.tsx   ← picker + pay button + popup (the full flow)
assets/bkash.webp
assets/nagad.webp
assets/rocket.webp
assets.d.ts             ← lets TS import .webp (delete if the project already has it)
demo/App.tsx            ← usage example (don't ship; reference only)
```

Only need the popup? Copy `SendMoneyPopup.tsx` + `assets/` + `assets.d.ts`.

## 3. Dependencies

- **React 17+** (uses `createPortal` from `react-dom`). Nothing else — no icon
  library, no router, no HTTP client, no CSS framework. All icons are inline
  SVG; all CSS is scoped (`dp-*`, `smc-*` prefixes).
- Bundler must resolve `.webp` imports (Vite, Next, CRA, webpack asset modules
  all do by default). If it doesn't, keep `assets.d.ts` and/or pass logo URLs
  via the `brands` prop instead.

## 4. Wire it up (the ONLY required integration)

```tsx
import { SendMoneyCheckout } from "@/components/payment/SendMoneyCheckout";

<SendMoneyCheckout
  amount={490}
  receivers={{ bkash: "017...", nagad: "018...", rocket: "019..." }}  // YOUR merchant numbers
  onSubmit={async (provider, reference) => {
    // provider: "bkash" | "nagad" | "rocket"
    // reference: sender phone (bkash/nagad) OR TrxID (rocket)
    await api.post("/payment-claim", { provider, reference }); // <-- YOUR endpoint
    // throw new Error("এই নম্বর আগেই ব্যবহৃত") to show a toast + keep the popup open
  }}
  onSuccess={(provider, reference) => {
    navigate("/thank-you"); // or /register?token=... — whatever your flow needs
  }}
/>
```

That's it. `onSubmit` is where you connect the host project's backend.

## 5. The seams (what changes per project)

| Seam | How to set it |
|---|---|
| Merchant MFS numbers | `receivers` prop (usually fetched from your config/API) |
| Amount | `amount` prop |
| Backend claim endpoint | inside your `onSubmit` |
| Post-success action | `onSuccess` (navigate / analytics / etc.) |
| Brand name / subtitle text | `popupLabels={{ brandSubtitle: "YourBrand · নিরাপদ পেমেন্ট" }}` |
| Any label (Bangla/English) | `popupLabels` / `pickerTitle` / `payButtonLabel` props |
| Colors / logos | `brands` prop (override `DEFAULT_BRANDS`) |
| Providers shown / order | `providers` prop, e.g. `["bkash","nagad"]` |

## 6. Backend contract (implement on the host's server)

The kit posts nothing itself — YOU do, inside `onSubmit`. A typical endpoint:

- **POST** `/payment-claim`  body `{ provider, reference }`
  - `provider`: `bkash | nagad | rocket`
  - `reference`: for bkash/nagad a sender phone `01[3-9]\d{8}`; for rocket a
    TrxID `[A-Za-z0-9]{10}`. **Re-validate server-side** — never trust the client.
  - Store it as a *pending* claim; return whatever `onSuccess` needs (e.g. a token).
  - An admin/webhook later matches the money and marks it verified.

Keep merchant numbers server-side and expose them through a read-only config
endpoint (e.g. `GET /checkout-config → { price, numbers }`) rather than hardcoding.

## 7. GOTCHAS — do not "fix" these, they are deliberate

- **The popup is portaled to `<body>`.** This is required so the overlay's high
  z-index beats sticky headers / any ancestor that creates a stacking context
  (`transform`, `filter`, `position:relative;z-index`). If you un-portal it, a
  sticky navbar will render *on top of* the blurred backdrop. Leave the portal.
- **Background scroll is locked** while the popup is open (`body.overflow=hidden`)
  and restored on close. Keep it — a real user leaves to the bKash app and comes
  back; the page must not have scrolled away underneath.
- **Rocket uses TrxID, bKash/Nagad use sender number.** Driven by
  `usesTrxId` on the brand. The input type, maxLength, validation, and step-3 copy
  all switch on it.
- **Close asks for confirmation** (built-in, in-popup) so a stray tap doesn't
  discard a half-typed reference. Pass `skipCloseConfirm` only if you have a reason.
- **Clipboard has a legacy fallback** (`execCommand`) for old in-app browsers.
- **Success state auto-closes** after `autoCloseMs` (default 1300). Set `0` to
  close manually from `onSuccess`.

## 8. Adapting to a non-React stack

The design lives in two places you can port verbatim: the `POPUP_CSS` string
(all `dp-*` classes) and the inline SVG icons. Reproduce the same DOM structure
(strip → amount → receiver+copy → steps → input → button), keep the CSS, and
re-implement the small state machine (copied / busy / done / error-shake /
confirm-close). The validation regexes and the Rocket-vs-phone branching are the
only logic.

## 9. Verify after implementing

1. Picker shows 3 logos; selecting one moves the checkmark + lifts the card.
2. Pay button opens the popup with the correct brand color + logo.
3. Copy button copies the receiver number and toasts.
4. bKash/Nagad reject anything but a valid `01xxxxxxxxx`; Rocket rejects anything
   but 10 alphanumerics (input shakes + toast).
5. Valid submit calls your endpoint, shows the green success state, then fires
   `onSuccess`.
6. The backdrop blurs/dims the **entire** page including any sticky header.
7. Mobile: popup is centered, scrollable, and the on-screen keyboard doesn't clip
   the submit button.

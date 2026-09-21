# 🇧🇩 bKash · Nagad · Rocket · Bank — Send-Money Checkout + Auto-Verify

The **production checkout of a Bangladeshi SaaS, copied pixel for pixel**,
with the server side that makes it honest: the popup records a *claim* ("I
sent ৳2,950 from 01712…"), your server confirms the *money* — automatically,
from the payment SMS, through the **SmartPay Auto Verify** app on the
receiving phone — and only then does anything activate.

**Vanilla JS master copy + React/TypeScript variant · one shared stylesheet ·
server references for Node, Laravel and WordPress · zero dependencies · MIT.**

---

## What you get

- **The picker + the popup, same to same.** Name + phone, four method tiles,
  the sticky pay bar, a popup with the amount, the number to copy, three
  steps, the sender-number / TrxID field, and *the answer* — one card that
  says "checking…", "৳2,950 পেয়েছি ✓", or "টাকাটা এখনো পৌঁছায়নি" with a live
  clock, the number to send to again, and a way to continue. Bank transfer
  with one-tap copy-all. A done card that tells the truth. A WhatsApp door.
- **The server contract, implemented three ways** (`server/`): the claim,
  the "did the money arrive?" poll, and the webhook the SmartPay app posts
  each payment SMS to — with the matching rules that make bKash's masked
  merchant numbers, Nagad's agent cash-ins and Rocket's TrxIDs land on the
  right claim, and the amount tolerances that approve ৳1,020 on a ৳1,000
  order but hold ৳5,000. Runnable, tested.
- **The parts a screenshot cannot show**: the Facebook-in-app-browser
  keyboard fix, Bangla-IME-safe inputs, a reference field that is *never*
  prefilled, refresh-proof popups, enter-to-submit, close-asks-first, and a
  rule that `Purchase` fires from the server when money is confirmed —
  never from the browser on Submit.

## Two ways to use it

### 🤖 Hand it to your AI agent (recommended)

> Read https://github.com/developeralamin45/Public-Resource-For-Vibe-Coding/tree/main/bkash-nagad-rocket-bank-payment-kit
> and implement it in this project. Follow its RECIPE.md: inspect my codebase
> first, build the checkout same to same, implement the server contract and
> the SmartPay auto-verify webhook, then tell me what I need to do myself.

That one sentence is enough. [`RECIPE.md`](./RECIPE.md) is the brief:
discovery, files, seams, the invariants, the verification list, and what
only a human can do at the end.

### 🧑‍💻 By hand

1. Copy `checkout.css`, `keyboard-aware.js`, `assets/` and **one** of
   `react/` or `vanilla/` into the project.
2. Render it with the amount, your merchant numbers, and four callbacks to
   your server (`react/demo/App.tsx` / `vanilla/demo.html`).
3. Implement the four endpoints of [`server/CONTRACT.md`](./server/CONTRACT.md)
   from the reference closest to your stack.
4. Point the SmartPay app at the webhook.

See it run, end to end, in under a minute:

```bash
node server/node/demo-server.js      # http://localhost:8787 — the checkout on a demo backend
node --test server/node/             # the matching + tolerance rules
```

## What's in the box

```
README.md · RECIPE.md · LICENSE
checkout.css            ← ONE stylesheet, verbatim production, shared by both variants
keyboard-aware.js       ← soft-keyboard survival kit (page-level, framework-agnostic)
assets/                 ← bkash / nagad / rocket logos (bank draws its own tile)
react/                  ← SendMoneyCheckout · SendMoneyPopup · useSendMoneyCheckout · payment · labels · bdPhone · useImeInput · icons · demo/
vanilla/                ← send-money-checkout.js · bd-phone.js · demo.html
server/
├── CONTRACT.md         ← the four endpoints, the SmartPay payload, matching + tolerance rules, edge cases
├── node/               ← smartpay-rules.js (pure, tested) · demo-server.js (runnable, zero deps)
├── laravel/            ← Support/SmartPayRules.php · migrations · models · controllers · routes · config
└── wordpress/          ← smartpay-verify.php (WooCommerce plugin)
```

## The flow, honestly

```
visitor picks bKash → sends money in the bKash app → types the number they sent FROM
   │                                                               │
   ▼                                                               ▼
your server stores the CLAIM  ◄──── matches ────►  the SmartPay app posts the payment SMS
   │                                                               │
   └──────── the popup asks every 8 s: "did it arrive?" ───────────┘
                          found → activate / mark paid / Purchase (server-side)
                      not yet → "টাকাটা এখনো পৌঁছায়নি", number again, continue later
```

Either order works — typed first or SMS first — and that is the point.

## Notes

- Not affiliated with bKash, Nagad or Rocket. Logos identify the payment
  method in the UI, as checkout UIs do; replace them if your use requires.
- Client-side validation is for the buyer's benefit; the server re-validates
  everything and never trusts the browser with amounts or merchant numbers.
- The SmartPay Auto Verify app (APK, source, the guide with every verified
  SMS format): <https://github.com/developeralamin45/Auto-Payment-Verify-Apps>.

## License

MIT — use it anywhere, including commercial projects.

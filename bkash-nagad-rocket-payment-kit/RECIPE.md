# RECIPE — bKash / Nagad / Rocket / Bank Send-Money Checkout

> **For the AI agent implementing this in another project.** Read this top to
> bottom, then adapt to the host project's stack. The goal is a **pixel-faithful
> copy** of the payment method picker + send-money popup, wired to the host
> project's own backend. Do **not** redesign the UI — keep it "same to same".

---

## 1. What this is

A Bangladeshi manual-payment checkout, four methods:

1. A **method picker** — bKash / Nagad / Rocket (+ Bank if the merchant has one),
   each with its real logo.
2. A **send-money popup** — brand header strip, amount card, copy-able receiver
   number (or full bank details with one-tap copy-all), step-by-step
   instructions, and a validated reference input:
   - bKash / Nagad → the customer's **sender phone number** (`01XXXXXXXXX`).
   - Rocket → a **Transaction ID** (10 alphanumerics).
   - Bank → a **transaction ID / reference** (4–40 chars, `A-Z 0-9 / -`).
3. **Wallet switcher tabs inside the popup** — balance short in bKash? Switch
   to Nagad without losing the popup (the typed sender number survives a
   bKash↔Nagad switch; Rocket gets a fresh TrxID field).
4. **Reopen after refresh** — the open popup, chosen wallet, amount and the
   half-typed reference all survive a page refresh or a trip to the wallet app
   (localStorage, namespaced by `popupKey`).
5. **Soft-keyboard & IME survival** — the part you cannot see in a screenshot,
   battle-tested against Facebook's in-app browser. See §7; it is most of the
   value of this kit.
6. On submit, the validated reference is handed to **your backend**, which
   records the claim; an admin later verifies the money and unlocks whatever
   the payment was for.

It is intentionally **backend-agnostic**: UI + validation + UX only.

## 2. Two variants — pick by stack

| Variant | Use when | Coverage |
|---|---|---|
| **`vanilla/`** — the master copy | Laravel/Blade, Django, Rails, plain PHP, any server-rendered page — and the porting source for everything else | All four methods, tabs, refresh-restore, prefill, keyboard kit — the full production feature set |
| **`react/`** | React SPA that only needs the three wallets, fast | Wallet popup + picker. Bank flow, tabs and refresh-restore are not ported yet — port them from `vanilla/` if the project needs them |

**`vanilla/` is canonical.** When the two disagree, or when you need a feature
`react/` lacks, port from `vanilla/send-money-popup.html` — the DOM structure,
class names (`dp-*`) and logic transfer almost line by line.

## 3. Files

```
vanilla/
├── send-money-popup.html   ← CONFIG block + CSS + markup + logic. Paste into your
│                             checkout page/partial; edit ONLY the DP_CONFIG block.
├── keyboard-aware.js       ← page-level soft-keyboard kit. Include ONCE on any page
│                             with a form a phone will fill in (not just checkout).
├── bd-phone.js             ← BD phone smart-normalizer; load BEFORE the popup script.
└── assets/{bkash,nagad,rocket}.webp

react/
├── SendMoneyPopup.tsx      ← the core popup (import this if you have your own picker)
├── SendMoneyCheckout.tsx   ← picker + pay button + popup (the full flow)
├── assets/{bkash,nagad,rocket}.webp
├── assets.d.ts             ← lets TS import .webp (delete if the project has one)
└── demo/App.tsx            ← usage example (don't ship; reference only)
```

React projects still take `vanilla/keyboard-aware.js` — it is framework-agnostic
(one `<script>` in `index.html`) and the React popup's CSS already cooperates
with it (`html[data-kb]`, `--kb-reserve`).

## 4. Wire it up

### vanilla

1. Paste `send-money-popup.html`'s contents into the checkout page. Load
   `bd-phone.js` before its script block and `keyboard-aware.js` once per page.
2. Fill `DP_CONFIG` **from the server** (merchant numbers, bank details, app
   name, prefill, a per-checkout `popupKey`). In Blade that means
   `@json($paymentNumbers)` etc. — never hardcode numbers in the markup.
3. Drive it:

```js
// Your "pay" button:
document.getElementById('pay').onclick = () => window.dpOpen('bkash', 490);

// Your submit — the reference already passed validation:
window.dpOnSubmit = async (provider, reference) => {
  const res = await fetch('/payment-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, reference, amount: 490 }),
  });
  if (!res.ok) { window.dpToast('সমস্যা হয়েছে, আবার চেষ্টা করুন'); return; }
  location.href = '/thank-you';          // or window.dpClose() if you stay
};

// Optional: user switched wallets inside the popup — sync your picker.
window.dpOnSwitch = (provider) => { /* highlight the right card */ };
```

### react

```tsx
import { SendMoneyCheckout } from "@/components/payment/SendMoneyCheckout";

<SendMoneyCheckout
  amount={490}
  receivers={{ bkash: "017...", nagad: "018...", rocket: "019..." }}  // YOUR merchant numbers
  onSubmit={async (provider, reference) => {
    await api.post("/payment-claim", { provider, reference }); // <-- YOUR endpoint
    // throw new Error("এই নম্বর আগেই ব্যবহৃত") → toast + popup stays open
  }}
  onSuccess={() => navigate("/thank-you")}
/>
```

## 5. The seams (what changes per project)

| Seam | vanilla | react |
|---|---|---|
| Merchant numbers / bank details | `DP_CONFIG.numbers` / `DP_CONFIG.bank` (fill server-side) | `receivers` prop |
| Amount | `dpOpen(provider, amount)` | `amount` prop |
| Backend claim endpoint | your `window.dpOnSubmit` | your `onSubmit` |
| Post-success action | redirect or `dpClose()` in `dpOnSubmit` | `onSuccess` |
| Brand/app name | `DP_CONFIG.appName` | `popupLabels.brandSubtitle` |
| Refresh-restore namespace | `DP_CONFIG.popupKey` (one per checkout page) | not ported |
| Sender prefill (returning buyer) | `DP_CONFIG.senderPrefill` | not ported |
| Logo folder | `DP_CONFIG.assetsBase` | bundler imports |

## 6. Backend contract (implement on the host's server)

The kit posts nothing itself — YOU do, in `dpOnSubmit`/`onSubmit`. Typical:

- **POST** `/payment-claim` body `{ provider, reference }`
  - `provider`: `bkash | nagad | rocket | bank`
  - `reference`: bkash/nagad → sender phone `01\d{9}` · rocket → TrxID
    `[A-Za-z0-9]{10}` · bank → `[A-Za-z0-9/-]{4,40}`.
  - **Re-validate server-side** — never trust the client, especially the amount.
  - Store as a *pending* claim; an admin/webhook later matches the money.
- Serve merchant numbers/bank details from server config (admin-editable if
  you have a panel), through the page render or a read-only endpoint.
- Phone rule on the server must mirror the client's: 11 digits starting `01`,
  **nothing said about the operator digit** — operators reshuffle ranges, and a
  hardcoded 013–019 list rejects real customers the day a new range opens.

## 7. Soft keyboard & IME — why half this kit exists

**The bug:** a buyer arrives from a Facebook ad, so the page opens inside
Facebook's in-app WebView. They tap the reference field and the keyboard slides
up **over** it — Chrome shrinks the page and scrolls the field clear on its
own; the in-app WebView resizes nothing, scrolls nothing, and often does not
even fire the `visualViewport` resize event (the numbers change, the
announcement never comes). The field keeps receiving keystrokes the buyer
cannot see — on the exact screen standing between money already sent and the
order that records it.

**What `keyboard-aware.js` does about it** (include once per page; it needs no
markup and no config):

- Measures how much keyboard the browser did NOT account for and reserves that
  room at the foot of the document (`html[data-kb]`, `--kb-reserve`), so the
  page *can* scroll the field clear. In Chrome the measurement is zero and
  nothing happens at all.
- Nudges the focused field above the keyboard **once**, only if genuinely
  covered — inside the popup's own scroller, because scrolling the page under
  a fixed overlay moves nothing while looking like success.
- Runs a **heartbeat** (600ms, only while a field is focused) because
  Facebook's WebView fires no events: it re-measures, corrects late-opening
  keyboards and suggestion strips, notices the keyboard Android's back button
  closed, then retires itself.
- Stands down when the visitor scrolls, freezes during IME composition, holds
  still under pinch-zoom, resets after bfcache restores.

**The popup's half of the contract** (already in both variants' CSS/JS):

- `html[data-kb] .dp-center{padding-bottom:…+var(--kb-reserve)}` — the overlay
  is its own scroller, so it must spend the reserved room itself.
- `scroll-margin-bottom` on the input — "when you reveal me, reveal the submit
  button under me too". Chrome honours it natively; the kit honours it in
  broken hosts.
- Enter/done on the keyboard submits — the one control a keyboard cannot cover.
- The toast lifts above the keyboard under `html[data-kb]`.
- `overscroll-behavior:contain` — the overlay's end-of-scroll must not
  rubber-band the page behind it.

**The IME rules** (Bangla keyboards, Gboard suggestions, swipe typing):

- Never write to `.value` mid-composition — normalize when it commits
  (`compositionend`), never during. Rewriting mid-word snaps the caret and
  corrupts the word.
- Facebook's WebView has been seen committing a composition **without firing
  `compositionend`**. Treat blur as a commit, and normalize once more at
  submit. Any "am I composing?" flag must be cleared on blur/focus or it
  sticks forever.

### Do not "fix" these — they are deliberate

- **`interactive-widget=resizes-content` is rejected**, not forgotten: it
  changes what `100vh` means in every browser, including the ones with no bug.
- **The heartbeat's reserve never merely shrinks while typing** (it may grow,
  or drop to zero) — chasing a breathing suggestion strip is the
  "screen keeps jumping while I type" bug in the flesh.
- **The nudge threshold (12px) and the hands-off-on-touch rule** are what keep
  the popup from fighting the user for the scroll position.
- **The popup does not autofocus the input** — the buyer must read the number
  and steps first; an instant keyboard would cover them.
- **Background scroll locks** while the popup is open (`body.overflow=hidden`);
  the buyer leaves to the wallet app and comes back — the page must not have
  scrolled away underneath.
- **Wallet maxLength is 14, not 11** — paste room for `+8801…` before the
  normalizer trims it.
- **React: the popup is portaled to `<body>`** so its overlay escapes every
  ancestor stacking context; un-portal it and a sticky header paints over the
  backdrop.
- **Clipboard has a legacy `execCommand` fallback** for old in-app browsers.
- **Close asks for confirmation** so a stray tap doesn't discard a half-typed
  reference.

## 8. Verify after implementing

Desktop/Chrome:
1. Picker shows the configured methods; pay button opens the popup with the
   right brand color + logo; copy button copies and toasts.
2. bKash/Nagad reject anything but a valid `01xxxxxxxxx` (shake + toast);
   Rocket rejects anything but 10 alphanumerics; bank rejects <4 chars.
3. Pasting `+8801712-345678` or `০১৭১২৩৪৫৬৭৮` into bKash/Nagad becomes
   `01712345678`.
4. Switching tabs bKash→Nagad keeps the typed number; →Rocket clears it.
5. Refresh mid-payment: the popup reopens with wallet, amount and typed
   reference intact. Submit or confirmed-close clears the restore.
6. Bank flow (if configured): details render, copy-all copies every row with
   labels, submit validates the reference.

Mobile — **test inside the Facebook app's browser, not just Chrome** (share the
URL to yourself on Messenger and open it from there):
7. Focus the reference field: within a second the field AND the submit button
   sit above the keyboard. No jumping while typing with a Bangla keyboard.
8. Scroll while the keyboard is up: the page stays where you put it.
9. Close the keyboard with Android's back button: the reserved space clears.
10. The keyboard's enter key submits; the validation toast is visible above
    the keyboard, not behind it.

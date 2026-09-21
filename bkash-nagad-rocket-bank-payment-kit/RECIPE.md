# RECIPE — bKash / Nagad / Rocket / Bank send-money checkout + auto-verify

> **For the AI agent implementing this in another project.** Read it top to
> bottom before copying a file. The deliverable is the production checkout,
> **same to same** — every size, colour, word and gesture — plus its server
> side and the SmartPay auto-verify hookup, fitted to the host project's
> stack. Do **not** redesign the UI. Do **not** skip the server half: a
> popup that records a number and verifies nothing is the thing this kit
> exists to replace.

---

## 1. What you are building

A Bangladeshi manual-payment checkout, copied from a live product that
takes real payments every day (2026-09-22 snapshot):

```
  section heading  →  আপনার নাম / ফোন নাম্বার  →  বিকাশ · নগদ · রকেট · ব্যাংক tiles
                                                          │
                       sticky "৳X টাকা পেমেন্ট করুন" bar  ─┘
                                                          ▼
   ┌─ popup ──────────────────────────────────────────────────────────┐
   │ wallet tabs · amount · number to copy · three steps ·            │
   │ "যে বিকাশ নম্বর থেকে টাকা পাঠালেন" · [লেনদেন যাচাই করুন]        │
   │                       ▼ submit                                   │
   │ the ANSWER, one card: checking… / ৳X পেয়েছি ✓ / টাকাটা এখনো   │
   │ পৌঁছায়নি (live clock, নম্বর বদলান, the number again, continue)   │
   └──────────────────────────────────────────────────────────────────┘
                                                          ▼
                       done card: পেমেন্ট পাওয়া গেছে ✓ · [রেজিস্ট্রেশন সম্পন্ন করুন]
```

Behind it, on the server: the claim is stored, the popup polls "did the
money arrive?", and the **SmartPay Auto Verify** app on the receiving phone
posts every payment SMS to a webhook that matches it to the claim. The
money is confirmed on the server — never in the browser.

Three layers, three folders:

| layer | folder | what |
|---|---|---|
| UI | `react/` **or** `vanilla/` (+ `checkout.css`, `keyboard-aware.js`, `assets/`) | the checkout, pixel-faithful |
| server | `server/` (`node/` reference + tests, `laravel/`, `wordpress/`) | claims, the poll, the SmartPay webhook |
| phone | the SmartPay app (separate repo, linked in `server/CONTRACT.md` §7) | reads the SMS, posts it |

## 2. Discovery — read the host project first

Decide these before you copy anything, and say what you decided:

1. **Stack → variant.** React/Next → `react/`. Blade, Django, Rails, plain
   PHP, static HTML → `vanilla/`. Both render the same DOM from the same
   `checkout.css`; pick by stack, never mix.
2. **What does the payment buy?** An account, an order, a course seat, a
   renewal. It sets three things: the labels that name it (§5 — "অ্যাকাউন্ট
   চালু" vs "অর্ডার কনফার্ম"), what `onSuccess` navigates to, and what the
   server does when money is confirmed.
3. **Is the buyer known?** Anonymous landing page → keep the name + phone
   form (`askLead`, the default) — it is the only record of a visitor who
   leaves. Signed-in user / order already placed → `askLead: false` and use
   the account's phone as `lead.phone` on the server.
4. **Where do merchant numbers live?** Find the settings table / admin
   panel / `.env`. They are served to the page; they are never typed into
   a template twice.
5. **Where do claims live?** If the project has an `orders` table, the
   order **is** the claim — add the columns (`server/laravel/database/
   migrations/…payment_claims…`) to it rather than creating a second
   table. Otherwise create `payment_claims`.
6. **Existing routes / auth / CSRF conventions** for the four endpoints
   (`server/CONTRACT.md`). The webhook must be CSRF-exempt and public
   (Bearer-secret), served at an exact final HTTPS URL with no redirect.
7. **Analytics.** Meta pixel present? Then `onTrack` maps to it — and you
   remove any browser-side `Purchase` you find (§6).
8. **Font.** Anek Bangla. If the project does not load it, add the Google
   Fonts `<link>` (or self-host); the fallbacks keep the layout but not the
   look.

## 3. Files

```
checkout.css              ONE stylesheet, both variants — verbatim from production; do not edit numbers
keyboard-aware.js         soft-keyboard kit. Include ONCE per page (index.html / layout), any page with a form
assets/{bkash,nagad,rocket}.webp   the logos (bank draws its own tile)

react/
├── SendMoneyCheckout.tsx   the whole flow: heading, lead form, tiles, sticky bar, popup, done card, bubble
├── SendMoneyPopup.tsx      the popup alone (own picker? use the hook + this)
├── useSendMoneyCheckout.ts the state machine — every handler of the production page
├── payment.ts              types, method meta, bank helpers, storage keys
├── labels.ts               every string, overridable
├── bdPhone.ts · useImeInput.ts · icons.tsx · index.ts · assets.d.ts
└── demo/App.tsx            usage (reference only)

vanilla/
├── send-money-checkout.js  the same flow in plain JS: SendMoneyCheckout.mount(el, options)
├── bd-phone.js             load BEFORE send-money-checkout.js
└── demo.html               usage (runs against server/node/demo-server.js)

server/
├── CONTRACT.md             the four endpoints, the SmartPay payload, matching + tolerance rules
├── node/smartpay-rules.js  the rules as pure functions (+ smartpay-rules.test.mjs, `node --test server/node/`)
├── node/demo-server.js     runnable reference, zero deps: `node server/node/demo-server.js`
├── laravel/                Support/SmartPayRules.php · 3 migrations · 3 models · 3 controllers · routes.example.php · config
└── wordpress/smartpay-verify.php   WooCommerce: the SmartPay app's own plugin + the pool + claim routes
```

## 4. Wire it up

### react

```tsx
import { SendMoneyCheckout } from '@/components/payment';   // copy react/ here
import '@/components/payment/checkout.css';                  // copy checkout.css next to it
// index.html: <script src="/keyboard-aware.js"></script>    // copy to public/

<SendMoneyCheckout
  amount={2950} amountTag="বার্ষিক" doneSuffix="• বার্ষিক প্ল্যান"
  config={paymentConfig}                    // { bkash, nagad, rocket, bank } from YOUR server
  popupKey="annual"                         // one per distinct checkout (an order id)
  support={{ whatsapp: '8801…', offer: 'X-এর বার্ষিক প্ল্যান (২,৯৫০ টাকা)' }}   // omit → no WhatsApp line/bubble
  onLead={(lead, stage, extra) => api.post('/lead', { ...lead, stage, ...extra })}
  onSubmit={claim => api.post('/payment-claim', claim)}           // throw new Error('বাংলায় কারণ') → under the field
  checkClaim={claim => api.post('/payment-claim/check', claim)}   // → ClaimCheck
  onSuccess={info => navigate('/register')}                       // or '/thank-you', `/order/${id}`
  onTrack={(event, params) => fbq('track', event, params)}        // InitiateCheckout · AddPaymentInfo · Contact — never Purchase
/>
```

Own method picker? `const c = useSendMoneyCheckout(options)` → your tiles
call `c.openPopup('bkash')` → render `<SendMoneyPopup checkout={c} />`.
Sticky bar off (`stickyCta={false}`) → drive it through the ref:
`ref.current.pay()`.

### vanilla

```html
<link rel="stylesheet" href="/vendor/payment/checkout.css">
<div id="pay"></div>
<script src="/vendor/payment/bd-phone.js"></script>
<script src="/vendor/payment/send-money-checkout.js"></script>
<script src="/vendor/payment/keyboard-aware.js"></script>
<script>
  SendMoneyCheckout.mount(document.getElementById('pay'), {
    amount: {{ $price }}, amountTag: 'বার্ষিক',
    config: @json($paymentConfig),          // from the server — never hardcoded here
    assetsBase: '/vendor/payment/assets',
    popupKey: 'annual',
    support: { whatsapp: '8801…', offer: '…' },
    onLead:     (lead, stage, extra) => post('/api/lead', { ...lead, stage, ...extra }),
    onSubmit:   claim => post('/api/payment-claim', claim),          // returns a Promise; reject(Error('বাংলায় কারণ')) → under the field
    checkClaim: claim => post('/api/payment-claim/check', claim),    // Promise<ClaimCheck>
    onSuccess:  info => { location.href = '/register'; },
    onTrack:    (event, params) => fbq && fbq('track', event, params),
  });
</script>
```

`mount()` returns `{ pay(), open(method), reset(), destroy() }`.

### server

Implement the four endpoints of `server/CONTRACT.md` in the host's
framework, from the reference closest to it:

- **Laravel**: copy `server/laravel/` into `app/`, `database/`, `config/`,
  rename the migrations to today's date, add `routes.example.php` to
  `routes/api.php`, set `SMARTPAY_SECRET` in `.env`, fill the two "your
  seam" comments (attach the claim to the order/user; confirm the money).
- **WordPress / WooCommerce**: `server/wordpress/smartpay-verify.php` as a
  plugin. The order is the claim; run the checkout on the order-pay page
  with `popupKey` = the order id. Change `SMARTPAY_SECRET` and, if the
  checkout already saves the sender number under another meta key, the two
  `SMARTPAY_META_*` constants.
- **Node / anything else**: port `server/node/smartpay-rules.js` (pure
  functions, tests included) and wire it like `demo-server.js` does — its
  handlers are the contract, in about 60 lines.
- **Firebase / serverless**: the same handlers as callables + one HTTP
  function for the webhook; `received_payments` = a collection with a
  `used` flag.

Then hand the human the SmartPay app setup (CONTRACT.md §7): URL, secret,
site name — and run the `curl` before they touch the app.

## 5. The seams — what changes per project, and what does not

| seam | react | vanilla |
|---|---|---|
| amount, its tag in the popup, the done card's suffix | `amount`, `amountTag`, `doneSuffix` | same names in `options` |
| merchant numbers / bank | `config` | `config` |
| section heading (or none) | `heading` / `heading={null}` | `heading` / `null` |
| name + phone before paying | `askLead` (default true) | `askLead` |
| the WhatsApp door | `support.{whatsapp, offer, bubble}` | same |
| refresh-restore namespace | `popupKey` | `popupKey` |
| the four server calls | `onLead`, `onSubmit`, `checkClaim`, `onSuccess` | same |
| analytics, "the popup is opening" | `onTrack`, `onOpen` | same |
| every string | `labels` | `labels` |
| logos | bundler imports (`react/assets/`) or `logos` | `assetsBase` or `logos` |

**Labels you will actually change** — the ones that name what the payment
buys. Production sells an account, so the defaults say রেজিস্ট্রেশন /
অ্যাকাউন্ট চালু. For a shop: `ctaDone`, `doneButton`, `doneNote`,
`foundSub`, `foundButton`, `payNowNote`, `continueButton`, `neutralSub`,
`missingSubBank` → "অর্ডার কনফার্ম". Change the noun, keep the sentence —
each line was rewritten until it read like a person, not a system (e.g.
"টাকাটা এখনো পৌঁছায়নি", not "পেমেন্ট পাওয়া যায়নি").

**What does not change.** Sizes, colours, spacing, fonts, icons, the three
steps, the order of things in the popup, the tab row, the answer card's
shape, the sticky bar. `checkout.css` is verbatim production; if the host
has its own design system, the checkout still looks like this — that is
what "same to same" means. Scope: everything sits under `.bd-pay`, so the
host's CSS reset does not reach in and the kit's rules do not leak out.

## 6. Money is confirmed on the server — the rule behind the whole kit

The popup's Submit is **a claim, not a sale**. In the product this was
copied from, most submits were a number typed with no money sent; the
browser fired Meta `Purchase` on Submit; Meta optimised the ads toward
exactly those people, at great cost. So:

- The browser reports `InitiateCheckout` (popup opened), `AddPaymentInfo`
  (submit), `Contact` (WhatsApp tap) through `onTrack` — **never
  `Purchase`**. If the host fires `Purchase` from the browser today, remove
  it.
- The server confirms the money in exactly two places (CONTRACT.md §4/§5):
  when the SmartPay webhook settles a claim, and when the poll finds a
  pooled payment. That is where the account activates, the order is marked
  paid, and `Purchase` goes to the Conversions API with the real amount.
- Without a live verifier (`checkClaim` absent, or `verifier: off/stale`)
  the popup says "পেমেন্ট যাচাই চলছে" and lets them continue; it never
  says "not received", and nothing is confirmed.

## 7. The behaviour a screenshot cannot show — do not "fix" these

Each of these was a reported bug in production. They are all in both
variants; keep them when adapting.

- **The reference field starts EMPTY on every open — never prefilled**, not
  from the order form's phone, not from the account, `autocomplete="off"`.
  Copying our number and typing theirs is the one act that has to follow
  the sending; prefilled, the popup was one tap and the money never sent.
  And the phone's own number is wrong whenever the money went from someone
  else's wallet (a relative's, as often as not).
- **The field is not autofocused.** On one screen the keyboard would cover
  the number they came to copy.
- **Nothing is written to an input mid-IME-composition** (`useImeInput` /
  `imeInput`): a Bangla keyboard holds half a word in a buffer the browser
  owns; rewriting `.value` then turns ০১৭ into ০১৭১. Normalise on
  `compositionend` — and on blur, because Facebook's WebView commits
  without the event — and once more at submit.
- **The keyboard's enter key submits** (done/next/blur on the right
  fields), `isComposing`/229 excluded — the one control a keyboard cannot
  cover.
- **The name/phone jump on validation is instant, `block: 'start'`**, with
  `preventScroll` on focus: centred is behind the keyboard in Facebook's
  browser, smooth is a page still moving when the keyboard kit looks.
- **`keyboard-aware.js`**: Facebook's in-app browser draws the keyboard
  over the page and reports nothing. The kit shortens the popup to the safe
  band and scrolls the field's *bottom* (plus its `scroll-margin-bottom`,
  the submit button) to the foot of that band — never a landing line at the
  top, never by adding padding. Read its header before touching it; run its
  tests if you do (`tools/keyboard` in the origin repo).
- **`interactive-widget=resizes-content` is rejected**, not forgotten: it
  changes `100vh` in every browser, including the ones with no bug.
- **The popup restores after a refresh** (localStorage, `bdpay_ui_<key>`)
  — the buyer goes to the wallet app and comes back.
- **Wallet tabs keep the typed number**; the picker follows the tab. Bank
  has no tab: a one-way door from the picker.
- **✕ asks first.** A stray tap must not discard a half-typed number for
  money already sent.
- **The answer never accuses.** "টাকাটা এখনো পৌঁছায়নি" + "১–২ মিনিট লাগতে
  পারে", the number to send to again ("এখনো না পাঠিয়ে থাকলে"), "নম্বর
  বদলান", and only after 30 s "রেজিস্ট্রেশন করে রাখুন". Bank gets one
  check and the continue button at once (nobody relays a bank credit within
  minutes).
- **`found` shows the green tick for 1.4 s before leaving** — a page that
  jumps the instant it says "received" reads as though it had not.
- **Body scroll is locked while the popup is open**; unlocked on close.
- **Wallet `maxLength` is unset**: the browser clips a paste *before* any
  script sees it; `+880 1712-345678` must arrive whole and be folded to 11
  digits by the normaliser.
- **The done card tells the truth**: a claim the money has not confirmed
  says "টাকাটা এখনো পৌঁছায়নি" with "পাঠিয়েছি, আবার দেখুন" — never "done".
- **The WhatsApp bubble yields to the form**: it slides out while the
  checkout section is in the upper half of the screen, waits 1.2 s after
  paint, and is gone while the popup is open.

## 8. Verify after implementing

Desktop / Chrome (`node server/node/demo-server.js` shows the expected
behaviour side by side):

1. Tiles show only the configured methods; the sticky bar says the price;
   tapping it with the form empty flags the name field and opens nothing.
2. Name + phone (try `০১৭১২ ৩৪৫ ৬৭৮`) → the number reads `01712345678`;
   the lead endpoint got `typed`, then `checkout` when the popup opens.
3. Popup: brand colour, logo, the number, copy works, the field is empty
   and not focused, tabs switch and keep the typed number, refresh
   restores everything.
4. `0171` → Bangla error under the field. A valid number + Enter → the
   checking card, then the amber "not yet" card with a clock; no continue
   button for 30 s; "নম্বর বদলান" returns to the form with the number.
5. Play the SmartPay app with the `curl` in `demo-server.js` (sender =
   the typed number) → within 8 s the green card, then the done card and
   `onSuccess`. Run the `curl` **first** and type after → found at once.
6. Rocket: TrxID field, caps, `rock 123456` → `ROCK123456`. Bank: five
   rows, copy-all, no tabs, one check, primary continue button.
7. The same `curl` twice → the same reply, one approval.
8. `Purchase` is nowhere in the browser bundle.

On the phone — **inside the Facebook app's browser, not just Chrome**
(share the URL to yourself on Messenger):

9. Tap the reference field: within a second the field AND the submit
   button sit above the keyboard; no jumping while typing with a Bangla
   keyboard; the page stays where you scroll it; the keyboard's enter
   submits.

Then the real thing: a ৳10 payment to the merchant number with the app
running → the popup finds it, the app's Payments tab shows the site name
and the claim number.

## 9. Hand back to the human

- `SMARTPAY_SECRET` to generate and paste into the app; the webhook URL;
  the site name.
- The merchant numbers / bank account to fill in wherever you put them
  (admin panel > `.env`).
- If Meta ads: the Conversions API token for the server-side `Purchase`,
  and confirmation that the browser `Purchase` is gone.
- Which noun you chose for the labels (§5), so they can correct it.

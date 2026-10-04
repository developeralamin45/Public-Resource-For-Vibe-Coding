# 📊 Meta (Facebook) Pixel + Conversions API Kit

Every standard event, fired in the browser **and** from the server under one
`event_id` — and a **Purchase that fires when the sale is real for your kind
of business**, not when someone presses a button.

**Vanilla JS (any stack) + React wrapper · Node and Laravel server references · MIT · free for anyone.**

---

## Why this is not just "paste the pixel"

Ads optimised for Purchase find more people like the ones who triggered it.
So *when* Purchase fires is the most expensive line in the whole setup — and
the right moment depends on the project:

| Policy | The sale is real when… | Typical project |
|---|---|---|
| `on_order` | the order is placed — Purchase fires **instantly** | Cash on delivery |
| `on_payment` | the payment gateway's verified callback arrives | SSLCommerz, bKash PGW, Stripe |
| `on_confirm` | someone (or an SMS verifier) confirms the money — server only | Send-money to a number, bank transfer, admin-approved plans, call-confirmed orders |

A shop with COD *and* send-money gets one policy per payment method.

**The agent works out which one your project is** by reading its order
statuses, payment methods and approval code ([`RECIPE.md`](./RECIPE.md),
Phase 1), tells you what it found, and builds to match. The kit is drawn from
three production projects — a subscription app, a COD shop with a CRM, and a
SaaS — each of which needed a different answer.

## What you get

- **All 18 standard events** as one-line calls — `MetaPixel.addToCart({...})`
  — with a per-project map of which to use where ([`EVENTS.md`](./EVENTS.md)).
- **Browser + server, deduplicated.** Each event goes out through `fbq` and
  the Conversions API with the same id. An ad blocker that eats the browser
  copy leaves the server copy standing.
- **A Purchase nobody can fake.** The public relay refuses Purchase; under
  `on_confirm` the browser cannot fire it at all; a retried webhook or a
  second click on "approve" sends nothing.
- **Attribution that survives the wait.** The click (`fbp`, `fbc`, IP, user
  agent) is stored with the order, so a Purchase confirmed days later is
  still tied to the ad that caused it.
- **Match quality done right.** Phone, email and name normalised and SHA-256
  hashed the way Meta expects — in the browser before anything leaves it.
- **No cost to page speed.** `fbevents.js` (≈260 KB) waits for the first
  touch or 2.5 s after load; events queue from the first millisecond.
- **Never breaks a checkout.** No tracking call can throw into an order, and
  the site runs normally before any credentials exist.

---

## Two ways to use it

### 🤖 Hand it to your AI agent

```
Read https://github.com/developeralamin45/Public-Resource-For-Vibe-Coding/tree/main/facebook-pixel-conversions-api-kit
and implement it in this project. Follow its RECIPE.md: inspect my codebase
first, work out when a sale is real here and tell me which purchase policy
you chose, then tell me what I need to do myself.
```

### 🧑‍💻 By hand

```html
<script src="/js/meta-pixel.js"></script>
<script>
    MetaPixel.init({ pixelId: '1234567890', purchasePolicy: 'on_order', relayUrl: '/api/meta/event' });
    MetaPixel.viewContent({ content_ids: ['1042'], content_type: 'product', value: 950, currency: 'BDT' });
</script>
```

Then follow [`RECIPE.md`](./RECIPE.md) from Phase 3 for the server half.

### See it run first

```bash
node server/node/demo-server.js     # → http://localhost:4747
```

A demo shop with all three policies side by side. Nothing reaches Facebook:
the pixel script is a stub and the "Conversions API" is the demo server, so
you can watch what the browser fired next to what Meta would have received.

---

## What's in the box

```
RECIPE.md        ← the implementation brief (agents + humans) — the purchase policy lives here
EVENTS.md        ← every standard event, its parameters, and a map per project type
CREDENTIALS.md   ← pixel id + access token, written for a non-developer

browser/
├── meta-pixel.js        the pixel: init, every event, purchase guard, attribution, relay
├── meta-pixel.d.ts      types
└── demo.html            served by the demo server

react/
├── metaPixel.ts         typed handle for bundled apps
└── useMetaPageView.ts   PageView on route change

blade/
└── meta-pixel.blade.php the layout partial for server-rendered sites

server/
├── CONTRACT.md          what any backend must implement
├── node/
│   ├── meta-capi.js           the rules, as pure functions (zero dependencies)
│   ├── meta-capi.test.mjs     node --test server/node/
│   └── demo-server.js         reference binding + the runnable demo
└── laravel/
    ├── app/Support/MetaCapi.php                the same rules in PHP — identical output
    ├── app/Http/Controllers/MetaEventController.php   the relay
    ├── config/meta.php                         credentials + the purchase policy map
    ├── database/migrations/…                   meta_attribution + meta_purchase_sent_at
    ├── routes.example.php
    ├── wiring.example.php                      the three call sites, and the thank-you page
    └── tests/MetaPurchaseTest.example.php
```

## Design decisions worth knowing

- **The unknown defaults to `on_confirm`.** A missing or misspelt policy
  under-reports; it can never announce a sale that did not happen.
- **One gate for every sale moment.** Order placed, gateway verified, human
  confirmed all call the same function; it is true once per order. Adding a
  payment method later is a config line, not new tracking code.
- **The browser gets a Purchase id only from the server**, and only once the
  server itself considers the sale made.
- **Stamped after success.** The "already sent" mark is written when Meta
  accepts the event, so an outage is retryable instead of a lost sale.
- **Value only where it is true.** Under `on_confirm`, events before the
  Purchase carry no amount.
- **Public pages only.** Not the admin panel, not logged-in screens, not a
  native app's WebView.

## Notes

- This kit covers the **website** pixel and Conversions API. Events from
  inside a native Android/iOS app go through the Meta SDK, not this.
- The Graph API version is pinned (`v23.0` at the time of writing). Meta
  retires versions about two years after release — check the
  [changelog](https://developers.facebook.com/docs/graph-api/changelog) when
  you install.
- If you serve visitors in the EU/UK, gate `MetaPixel.init` on consent with
  the `enabled` option.
- Pairs naturally with the
  [send-money checkout kit](../bkash-nagad-rocket-bank-payment-kit/): its
  auto-verify webhook is exactly the `confirmed` moment `on_confirm` needs.

## License

MIT — use it anywhere, including commercial projects. "Meta", "Facebook" and
related marks belong to their owner; this kit is not affiliated with Meta.

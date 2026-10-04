# RECIPE — Meta Pixel + Conversions API, with the right Purchase

**You are an AI coding agent. This file is your brief.** Read it end to end
before touching anything, then work through the phases in order.

Your job is **not** to paste a pixel snippet. It is to make this project tell
Meta the truth: every standard event that this project really has, fired at
the moment it really happens — and above all a **Purchase that fires when,
and only when, a sale is real for this kind of business**.

That last part is the reason this kit exists. Ads optimised for Purchase go
looking for more people like the ones who triggered it. If Purchase fires
when someone merely *says* they paid, Meta finds more people who say they
paid. One production project this kit is drawn from paid for exactly that
before it was caught. **You decide the moment by reading the project, in
Phase 1. Do not skip it and do not guess.**

---

## Phase 0 — Understand the project

Answer these from the codebase, not from assumptions.

1. **What does it sell, and to whom?** Models, routes, migrations.
   `Product` / `Cart` / `Order` → a shop. `Plan` / `Subscription` / tenants →
   a SaaS. A course, a booking, a donation, a lead form → say which.
2. **What is the stack?** Server-rendered (Blade, WordPress, plain PHP) or a
   single-page app (React / Vue / Next)? Laravel, Node, Firebase, something
   else? This decides which files you copy (Phase 3) — the rules are the same
   everywhere.
3. **Is a pixel already here?** Grep for `fbq(`, `fbevents`, `facebook.com/tr`,
   `graph.facebook.com`, `event_id`, `eventID`, and for Google Tag Manager
   (`GTM-`) — a pixel is often injected through GTM or a plugin, invisible to
   a code search for `fbq`. If one exists **you are replacing it, not adding a
   second**: two pixels double every event. List every existing `fbq('track'`
   call and what triggers it; that list is your "before".
4. **Where does the public site end?** The pixel belongs on the marketing
   and checkout pages only. Never on the admin panel, never on logged-in app
   screens, and **never inside a native app's WebView** (it is third-party
   data sharing the app's store listing has to declare). Find how the project
   tells these apart — a layout, a route group, a user-agent tag.
5. **Where do settings live?** `.env` only, or a settings table with an admin
   screen? If the owner already edits things like this from an admin panel,
   the pixel id and token go there too (Phase 6).
6. **Which language is the UI in?** The final checklist you hand the human is
   written in their language.

---

## Phase 1 — Decide the Purchase policy

A sale becomes real at a different moment in different businesses. This kit
has one name for each:

| Policy | The sale is real when… | Browser fires Purchase? | Typical project |
|---|---|---|---|
| **`on_order`** | the order is placed | Yes — thank-you page, same `event_id` as the server | Cash on delivery |
| **`on_payment`** | the payment gateway's **verified** callback says paid | Yes — gateway success page, same `event_id` | SSLCommerz, bKash/Nagad PGW, Stripe, any online checkout |
| **`on_confirm`** | a human or a verifier confirms it, minutes to days later | **Never.** Server only. The page fires `AddPaymentInfo` | Send-money to a personal number, bank transfer, admin-approved subscription, call-confirmed orders |

### How to find out which one this project is

Trace one order from the button to "done" and write down every status it
passes through and **what causes each change**:

- Grep the order / payment / subscription model for status values:
  `pending`, `placed`, `processing`, `paid`, `confirmed`, `approved`,
  `active`, `completed`, `cancelled`.
- Grep for payment methods: `cod`, `cash_on_delivery`, `payment_method`,
  gateway names, `ipn`, `webhook`, `callback`, `success_url`.
- Grep for a human in the loop: `approve`, `verify`, `confirm`, an admin
  controller that changes order or payment status, a CRM sync, an SMS /
  auto-verify webhook (e.g. the
  [send-money kit](../bkash-nagad-rocket-bank-payment-kit/) in this repo).

Then apply these, in order:

1. **The customer types a transaction id / sender number / uploads a
   screenshot, and someone or something checks it later** → `on_confirm`.
   What the customer submitted is a *claim*. This is the case most often
   wired wrong, and the expensive one.
2. **An account or plan is activated by an admin** (approve button, manual
   renewal) → `on_confirm`, hooked on the activation.
3. **A gateway redirects back and also calls the server** (IPN / webhook) →
   `on_payment`, hooked on the server-verified callback — never on the
   browser's return URL alone, which anyone can open.
4. **Cash on delivery, and the placed order is the business's sale** →
   `on_order`. Purchase fires immediately, browser and server.
5. **Several payment methods** → one policy *per method*. That is what the
   `methods` map in the config is for:
   `{ default: 'on_confirm', methods: { cod: 'on_order', sslcommerz: 'on_payment' } }`.

### The one case you must ask about

**Cash on delivery with a confirmation step** — a call centre or a CRM that
confirms each order before it ships. Both answers are legitimate:

- `on_order`: Purchase at placement. More events, faster learning. Right
  when most placed orders are genuine.
- `on_confirm`: Purchase only when the order is confirmed; placement fires
  `Lead` + `AddPaymentInfo` with **no value**. Right when a large share of
  placed orders never confirm (fake numbers, duplicates, price-checkers) —
  one shop this kit is drawn from sees 70–80% of them fall away.

The codebase can tell you a confirmation step exists; it cannot tell you the
fake-order rate. **If there is a confirm step on COD, ask the human one
question** — "of the orders placed, roughly how many get confirmed?" — and
recommend `on_confirm` if the answer is under about two thirds. With no
confirm step, it is `on_order`; do not ask.

### Before you write any code

**Tell the human, in three or four lines:** what kind of project you found,
which policy (per payment method, if several) you chose and the evidence for
it, and the exact code location where Purchase will fire. If an existing
pixel fires Purchase somewhere else, say that it will move and why.

If you could not determine the policy, use `on_confirm` — it can only
under-report — and say that you did.

---

## Phase 2 — Build the event map for THIS project

Open [EVENTS.md](./EVENTS.md). It lists every standard event, its
parameters, and where it belongs in a shop, a SaaS and a lead-generation
site. Make a table for this project: **event → the exact user action →
the file that fires it**.

- **Only events the project really has.** No wishlist → no `AddToWishlist`.
  A decorative event that never fires, or fires on the wrong action, is worse
  than none: it pollutes the audience built from it.
- **One action, one event.** Do not fire `Lead` *and* `CompleteRegistration`
  *and* `Contact` for the same form.
- **Fire on the outcome, not the tap**, wherever the outcome is knowable: on
  the successful response of the add-to-cart call, on the registration that
  actually created an account — not on the button's click handler.
- **Product events carry product identity** (`content_ids`, `content_type`,
  and `value` + `currency` where the policy allows — next point). Use the
  same id the product catalogue uses, as a string.
- **Value under `on_confirm`:** leave `value` off every event before the
  Purchase. An unconfirmed 200-piece order must not teach Meta what a basket
  is worth. Under `on_order` / `on_payment`, funnel events may carry value.
- **A repeat is not a new event.** If the same person can place the same
  order five times to see the price, count the step once per person per
  period (see `countsAsNewOrder` in the notes of EVENTS.md).

Show the table to the human with the Phase 1 summary.

---

## Phase 3 — Install the browser half

Copy [`browser/meta-pixel.js`](./browser/meta-pixel.js) (+ `meta-pixel.d.ts`
in a TypeScript project). It is the only browser file; everything else is a
thin wrapper.

**Server-rendered site** — copy
[`blade/meta-pixel.blade.php`](./blade/meta-pixel.blade.php) (or reproduce it
in the project's templating) into the **public** layout. Pages push their
events onto its `pixel` stack.

**Single-page app** — copy [`react/metaPixel.ts`](./react/metaPixel.ts) and
[`react/useMetaPageView.ts`](./react/useMetaPageView.ts) (port the ten-line
hook for Vue / Svelte). Call `MetaPixel.init({...})` once at startup and
mount the PageView hook inside the router, on the public layout only.

`init` options that matter:

```js
MetaPixel.init({
    pixelId,                              // from the server / settings — never hard-coded
    purchasePolicy: 'on_confirm',         // Phase 1 (site default; a single order can override)
    relayUrl: '/api/meta/event',          // Phase 4; omit only if there is no server at all
    enabled: () => !isAdminPage() && !isNativeApp(),   // Phase 0, question 4
});
```

Then wire each row of the Phase 2 table:

```js
MetaPixel.viewContent({ content_ids: [String(product.id)], content_type: 'product', value: product.price, currency: 'BDT' });
MetaPixel.addToCart({ ... });
MetaPixel.initiateCheckout({ ... });
MetaPixel.completeRegistration({}, { eventId, user: { phone, email } });
```

Every call fires `fbq` and (with `relayUrl`) the server copy under one
`event_id`; pass `user` whenever the page knows the phone or email — it is
hashed in the browser before it leaves and raises match quality.

**At the "order placed / I have paid" moment**, use the one call that is
right under every policy:

```js
MetaPixel.orderSubmitted(customData, {
    purchaseEventId: order.purchaseEventId,   // server-issued; null when the browser must not fire Purchase
    policy: order.policy,                     // this order's policy, if methods differ
    eventId: 'add_payment_info.' + order.ref,
    user: { phone },
});
```

It fires Purchase when the server issued an id, `AddPaymentInfo` otherwise.
**Delete every other `fbq('track', 'Purchase'` in the project.**

**Send attribution with the order.** Whatever request creates the order,
lead or account must carry `MetaPixel.attribution()` (`{ fbp, fbc, url }`) so
the server can store it (Phase 4). Under `on_confirm` this is the only thing
that connects next week's Purchase to today's ad click. Skipping it does not
break anything visibly — it silently destroys attribution — so check it.

---

## Phase 4 — Install the server half

The contract is [`server/CONTRACT.md`](./server/CONTRACT.md); two reference
implementations produce byte-identical events:

- **Node / Firebase / serverless** — [`server/node/meta-capi.js`](./server/node/meta-capi.js)
  (pure functions, zero dependencies; `demo-server.js` shows the binding).
- **Laravel** — [`server/laravel/`](./server/laravel/): `MetaCapi.php`,
  `config/meta.php`, the relay controller, a migration, and
  `wiring.example.php`.
- **Anything else** (WordPress, Django, Go) — port `meta-capi.js`; it is
  ~300 lines and its test file is the specification.

Do these four things:

1. **Store attribution.** Add `meta_attribution` (json) and
   `meta_purchase_sent_at` (timestamp) to the row a sale hangs from — the
   kit's migration targets `orders`; **rename the table** to the project's
   (`subscriptions`, `payments`, `tenants`, `leads`…). At creation, save
   `readAttribution(request.meta, request)`. If a lead or account exists
   before the order, store it there too and carry it forward.
2. **Mount the relay** (`POST /api/meta/event`) behind a throttle. It
   forwards standard funnel events and **refuses Purchase** — keep that.
3. **Route every sale moment through one gate.** Find each place the project
   reaches a moment and call the gate there (`metaReach` in
   `wiring.example.php`, `reach()` in `demo-server.js`):

   | Moment | Where it is in a real project |
   |---|---|
   | `order_placed` | the checkout controller / place-order action |
   | `payment_verified` | the gateway IPN / webhook handler, **after** it verifies the signature or re-queries the gateway |
   | `confirmed` | the status transition to confirmed / approved / active — hook the **transition** (model observer, the single service that changes status), not one button, so the admin panel, the CRM sync and the SMS matcher all lead to it |

   Wire **all the moments the project has**, whatever the policy.
   `purchaseDue()` is true at exactly one of them per order and never after
   `meta_purchase_sent_at` is set — so a second payment method added next
   year only needs a line in the `methods` map.
4. **Hand the thank-you page its id.** Expose `purchaseEventId` to the page
   only when `browserMayFirePurchase(policy)` **and** the server already
   stamped the sale; otherwise `null` (see the page example at the bottom of
   `wiring.example.php`).

Rules the reference code already follows — keep them when you adapt it:

- **Tracking never throws into the business path.** Every send is wrapped;
  a Meta outage must not fail an order, a webhook or an approval.
- **Stamp after success, not before.** `meta_purchase_sent_at` is written
  only when Meta accepted the event, so an outage can be retried.
- **The access token stays on the server**, in the request body (not the
  URL, which lands in logs), and is never returned to a browser.
- **Renewals and repeats need their own id.** `purchase.<orderRef>` is one
  sale. A subscription renewed yearly needs a ref per renewal
  (`<tenant>:ren:<n>`), and its own "already sent" stamp per renewal.
- **Not everything that activates is a sale.** An admin correcting a plan,
  restoring a blocked account or granting a free extension flips the same
  status. Make the gate see *money*, not just *status* — exclude those paths
  explicitly.

---

## Phase 5 — Remove what this replaces

- Delete the old pixel snippet, old `fbq('track', …)` calls, and any old
  server CAPI code. If the pixel was injected by GTM or a plugin, tell the
  human precisely what to switch off there — you cannot do it from the code.
- Search once more for `Purchase` across the frontend. The only remaining
  occurrences should be `MetaPixel.purchase` / `orderSubmitted`.

---

## Phase 6 — Credentials and the off switch

Two values, both from Events Manager ([CREDENTIALS.md](./CREDENTIALS.md) is
the walkthrough for the human):

| Value | Secret? | Where |
|---|---|---|
| Pixel (Dataset) ID | No | `.env` `META_PIXEL_ID`, or the admin settings screen |
| Conversions API access token | **Yes** | `.env` `META_CAPI_TOKEN`, or the settings table — write-only in any admin UI |
| Test event code | No | `META_TEST_EVENT_CODE` — only while testing |

With no pixel id the browser half renders nothing; with no token the server
half is a silent no-op. The site must work fully in both states — the owner
will deploy first and paste credentials later.

If the project has an admin settings screen, add the fields there (behind
the project's real admin guard) and point `MetaCapi::credentials()` at it. A
saved token is never sent back to the browser: an empty box means "keep".

---

## Phase 7 — Verify, then report honestly

Run what you can and say exactly what you ran.

1. `node --test server/node/` in the kit passes untouched; port the tests in
   `MetaPurchaseTest.example.php` to the project's real order flow and run
   them.
2. With a test event code set, walk the real funnel once in a browser and
   check Events Manager → **Test events**: each step appears twice (Browser +
   Server) and is marked **Deduplicated**.
3. Place one order **per payment method** and confirm Purchase appears at
   the moment Phase 1 says — and *not* earlier. For `on_confirm`: submit the
   claim (no Purchase), then confirm it (one Purchase, with the value).
4. Trigger the sale moment twice (retry the webhook, click approve again):
   still one Purchase.
5. Open the admin panel and, if there is one, the native app: no pixel
   request leaves either.

If you could not do steps 2–5 (no credentials yet), say so and leave them
as the human's first task.

**Finish with a short checklist in the human's language:**

- Which policy each payment method got, and where Purchase now fires.
- The event table from Phase 2, as built.
- What they must do: create the dataset + token ([CREDENTIALS.md](./CREDENTIALS.md)),
  paste them, run the Test events check, **then empty the test code**.
- Anything to switch off outside the code (GTM tag, plugin).
- In Ads Manager: if Purchase moved later (`on_confirm`), the reported
  purchase count will **drop to the real number** — that is the fix working,
  not tracking breaking. Campaigns optimising on Purchase need a few days to
  relearn; if real purchases are fewer than ~50 a week per ad set, optimise
  on the step before it (`AddPaymentInfo` / `InitiateCheckout`) and keep
  Purchase as the number you judge by.

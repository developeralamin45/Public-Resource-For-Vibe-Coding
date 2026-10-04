# EVENTS — every standard event, and where it belongs

Meta has a fixed list of **standard events**. Campaigns can optimise for
them and audiences can be built from them, which is not true of custom
events — so always pick the standard event that fits before inventing one.

Each is one call: `MetaPixel.<name>(params, opts)`. Parameters are Meta's own
names. `value` is a number, `currency` an ISO code (`'BDT'`), `content_ids`
an array of **strings** that match the product catalogue.

## The list

| Event | Fire it when… | Parameters worth sending |
|---|---|---|
| `PageView` | every public page / route change (automatic — `init` and `pageView()`) | — |
| `ViewContent` | a product, plan or offer page is seen | `content_ids`, `content_type`, `content_name`, `value`, `currency` |
| `Search` | a site search returns | `search_string`, `content_ids` of results |
| `AddToCart` | the add-to-cart call **succeeds** | `content_ids`, `content_type`, `contents`, `value`, `currency` |
| `AddToWishlist` | an item is saved for later | `content_ids`, `content_name`, `value`, `currency` |
| `InitiateCheckout` | the checkout page / popup opens | `content_ids`, `contents`, `num_items`, `value`, `currency` |
| `AddPaymentInfo` | payment details are submitted — the method is chosen, the "I have sent the money" form is posted | `content_ids`, `contents`, `value`, `currency` |
| **`Purchase`** | **the sale is real — see the policy in RECIPE Phase 1** | **`value` and `currency` (required)**, `content_ids`, `contents`, `num_items`, `order_id` |
| `Lead` | a form that hands over contact details is submitted (quote, callback, an order that is not yet a sale) | `content_name`, `value`, `currency` |
| `CompleteRegistration` | an account is actually created | `content_name`, `status` |
| `Contact` | the visitor starts a call / WhatsApp / Messenger / email | `content_name` |
| `CustomizeProduct` | a configurator choice is made (size, colour, engraving) | `content_ids`, `content_type` |
| `Donate` | a donation is made — treat it as a Purchase for policy purposes | `value`, `currency` |
| `FindLocation` | the store locator / map is used | — |
| `Schedule` | an appointment or demo is booked | `content_name` |
| `StartTrial` | a free trial begins | `value: 0`, `currency`, `predicted_ltv` |
| `SubmitApplication` | an application form is submitted (admission, loan, job) | `content_name` |
| `Subscribe` | a **paid** subscription starts — policy applies exactly as for Purchase | `value`, `currency`, `predicted_ltv` |

Anything else is `MetaPixel.trackCustom('InstalledPwa', {...})` — browser
only, not relayed, not optimisable.

## What a typical project fires

Use these as a starting point for the Phase 2 table, then delete what the
project does not have.

### Shop (products, cart, orders)

| Step | Event |
|---|---|
| Product page | `ViewContent` |
| Site search | `Search` |
| Add to cart (success) | `AddToCart` |
| Checkout opens | `InitiateCheckout` |
| WhatsApp / call button | `Contact` |
| Order placed — `on_order` (COD) | **`Purchase`** (browser + server, same id) |
| Order placed — `on_payment` | `AddPaymentInfo`; then **`Purchase`** on the verified gateway callback |
| Order placed — `on_confirm` | `Lead` + `AddPaymentInfo` (no value); **`Purchase`** from the server when confirmed |

### SaaS / subscription

| Step | Event |
|---|---|
| Landing / pricing page | `ViewContent` (the plan as the product) |
| Signup creates the account | `CompleteRegistration` (or `StartTrial` if a trial starts — one, not both) |
| Payment popup / plan picker opens | `InitiateCheckout` |
| Payment details submitted | `AddPaymentInfo` |
| Plan activated (gateway callback or admin / verifier approval) | **`Purchase`** — server |
| Each paid renewal | **`Purchase`** again, with its own id |

### Leads / services / bookings

| Step | Event |
|---|---|
| Service page | `ViewContent` |
| Enquiry or quote form submitted | `Lead` |
| Appointment booked | `Schedule` |
| Call / WhatsApp tap | `Contact` |
| Application form submitted | `SubmitApplication` |
| The deal is paid for | **`Purchase`** — usually `on_confirm`, from wherever staff mark it won |

## Parameters, concretely

```js
// One product
{ content_ids: ['1042'], content_type: 'product', content_name: 'Cotton Panjabi',
  value: 950, currency: 'BDT' }

// A cart
{ content_ids: ['1042', '2210'], content_type: 'product',
  contents: [{ id: '1042', quantity: 2, item_price: 950 }, { id: '2210', quantity: 1, item_price: 400 }],
  num_items: 3, value: 2300, currency: 'BDT' }

// A plan
{ content_ids: ['plan-annual'], content_type: 'product', content_name: 'Annual plan',
  content_category: 'Software', value: 2950, currency: 'BDT' }
```

On the server, `orderCustomData(order, { withValue })` builds the same shape
from an order — use it for the page too (the demo and the Laravel wiring do),
so both halves of a pair carry identical data.

## Rules that keep the data honest

- **`event_id` pairs the two channels.** The browser event and its server
  copy must share an id, or Meta counts two. `MetaPixel` does this for
  relayed events automatically. For an event the *server* originates
  (Purchase; a registration the backend sends itself) the server makes the id
  — `purchase.<orderRef>`, `eventIdFor('Lead', ref)` — and gives it to the
  page.
- **One channel per event if you cannot pair them.** A server-only Purchase
  (`on_confirm`) is complete on its own. A browser-only event is weaker but
  fine. An unpaired *duplicate* is the thing to avoid.
- **Value only where it is true.** Under `on_confirm`, only Purchase carries
  `value`.
- **`countsAsNewOrder` — do not let one person inflate a step.** Where a
  step is cheap to repeat (placing a COD order just to see the total), count
  `AddPaymentInfo` once per phone per N days: before firing, look for an
  earlier order from the same phone inside the window; if there is one, send
  `Lead` only. Compute it on the server and let the page ask the same
  function, so both halves agree.
- **Never send raw personal data to Meta.** Email, phone, name are SHA-256
  hashed after normalising (lowercase email; digits-only phone with country
  code). `buildUserData` / `MetaCapi::userData` do it; the browser hashes
  before the relay. `fbp`, `fbc`, IP and user agent are sent as they are —
  Meta's requirement.
- **Logged-in activity is not marketing data.** Track the public funnel up
  to the sale. What a customer does inside their account stays there.

# Server contract

What a backend must do for the kit to work, in any language.
`node/meta-capi.js` is the reference (its test file is the specification);
`laravel/` is the same thing in PHP and produces identical events.

## 1. Store two things on the row a sale hangs from

| Field | Type | Written |
|---|---|---|
| `meta_attribution` | json | at creation, from the request |
| `meta_purchase_sent_at` | timestamp, nullable | when Meta accepts the Purchase |

The browser sends `MetaPixel.attribution()` — `{ fbp, fbc, url }` — with the
request that creates the order / lead / account. The server validates it and
adds what only it can see:

```
readAttribution(body.meta, { ip, userAgent })
→ { at, fbp?, fbc?, url?, ua?, ip? }      // null if the client sent nothing
```

`fbp` / `fbc` are kept only if they match `fb.<n>.<ms>.<value>`; `url` only
if it is http(s). Anything else is dropped, never stored.

## 2. `POST /api/meta/event` — the relay

Public, throttled. Body (from `meta-pixel.js`):

```json
{
  "event_name": "AddToCart",
  "event_id": "9b2f…",
  "event_source_url": "https://shop.example/p/1042",
  "fbp": "fb.1.1727000000000.1234567890",
  "fbc": "fb.1.1727000000000.IwAR…",
  "ph": "<sha256 hex or null>",
  "em": "<sha256 hex or null>",
  "custom_data": { "content_ids": ["1042"], "value": 950, "currency": "BDT" }
}
```

- `event_name` must be a standard event **and not `Purchase`** → otherwise
  `422 {"status":"refused"}` and nothing is forwarded.
- `ph` / `em` are used only if they are 64 hex characters.
- The server adds `client_ip_address` and `client_user_agent` from the
  request, sets `action_source: "website"`, and forwards to the Conversions
  API with the **same `event_id`**.
- Reply `200` at once; send to Meta after the response where possible.

## 3. The Purchase gate

Call it at **every** sale moment the project has:

```
reach(order, moment)        moment ∈ order_placed | payment_verified | confirmed

  policy = policyFor(config, order.payment_method)
  if not purchaseDue(policy, moment, order.meta_purchase_sent_at != null): return
  event  = buildPurchaseEvent(order, person, order.meta_attribution)
  if send([event]).ok: order.meta_purchase_sent_at = now
```

| Policy | `purchaseDue` is true at |
|---|---|
| `on_order` | `order_placed` |
| `on_payment` | `payment_verified` |
| `on_confirm` | `confirmed` |

Requirements:

- The whole gate is wrapped: no exception reaches the order, the webhook or
  the approval.
- `meta_purchase_sent_at` is written **after** a successful send.
- `payment_verified` is called only after the gateway callback has itself
  been verified (signature or re-query) — not from the browser's return URL.
- `confirmed` is hooked on the status transition, so every path to it
  (admin button, CRM sync, SMS matcher) goes through the gate.
- Events that change status without money (plan correction, unblock, free
  extension) do not call the gate.

## 4. The Purchase event

```json
{
  "event_name": "Purchase",
  "event_time": 1727000000,
  "event_id": "purchase.A-1001",
  "action_source": "website",
  "event_source_url": "https://shop.example/checkout",
  "user_data": {
    "em": ["<sha256>"], "ph": ["<sha256>"], "fn": ["<sha256>"], "ln": ["<sha256>"],
    "ct": ["<sha256>"], "country": ["<sha256>"], "external_id": ["<sha256>"],
    "fbp": "fb.1.…", "fbc": "fb.1.…",
    "client_ip_address": "203.0.113.9", "client_user_agent": "Mozilla/5.0 …"
  },
  "custom_data": {
    "value": 1900, "currency": "BDT", "order_id": "A-1001",
    "content_type": "product", "content_ids": ["7"],
    "contents": [{ "id": "7", "quantity": 2, "item_price": 950 }],
    "num_items": 2, "payment_method": "cod"
  }
}
```

- `event_id` is `purchase.<orderRef>` — deterministic, so a retry and the
  browser copy both deduplicate. Renewals use a ref per renewal.
- `action_source` is `website` when a user agent is on file, otherwise
  `other` (Meta rejects a website event with no user agent), and then
  `event_source_url` is omitted.
- Normalisation before hashing: email trimmed + lowercased; phone digits
  only with country code (`01712345678` → `8801712345678`); names lowercased,
  first word / last word; city lowercase a–z only; country two-letter
  lowercase.

## 5. What the page receives

The order response (or the thank-you page's view data) includes:

```
purchaseEventId   "purchase.<ref>"  — only if browserMayFirePurchase(policy)
                                      AND meta_purchase_sent_at is set; else null
policy            the order's policy
customData        orderCustomData(order, withValue = browserMayFirePurchase(policy))
```

and the page makes one call: `MetaPixel.orderSubmitted(customData, { purchaseEventId, policy, eventId, user })`.

## 6. Sending

`POST {base}/{version}/{pixel_id}/events` with JSON
`{ "data": [events], "access_token": "…", "test_event_code": "…"? }`.

- Token in the body, not the query string.
- Short timeouts (≈4 s connect, ≈8 s total).
- No credentials → silent no-op (`disabled`), not an error.
- Every non-success is logged with the event name and order ref; nothing is
  thrown.

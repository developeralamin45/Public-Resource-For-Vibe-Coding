# The server contract — checkout + SmartPay auto-verify

> Four endpoints. Three are called by the popup, one by the **SmartPay Auto
> Verify** Android app on the phone that receives the money. Implement them
> on the host's stack; `node/` is the runnable reference (with tests),
> `laravel/` the Eloquent version, `wordpress/` the WooCommerce plugin.

```
 the popup                                   the receiving phone
   │ POST /payment-claim   "I sent ৳X from 017…"     │ bKash / Nagad / Rocket SMS
   │ POST /payment-claim/check  every 8 s, 2 min     ▼
   ▼                                          SmartPay Auto Verify app
 ┌──────────────── YOUR SERVER ─────────────────┐    │ POST /smartpay/payment
 │  claims  ◄──── match ────►  received_payments │◄───┘   (Bearer secret, JSON)
 │  (pending → approved / hold)   (pool, used?)  │───► reply the app shows
 └───────────────────────────────────────────────┘
```

The two arrive in either order and must meet either way:

- **Typing first, SMS later** — the claim is pending; the webhook finds it
  (§3), approves or holds it, replies to the app. The popup's next poll sees
  the claim settled → *found*.
- **SMS first, typing later** — the webhook finds no claim, **pools** the
  payment (`used = false`), replies `not_found` (the app lists it under
  "খেয়াল করুন"). The popup's poll finds it in the pool → *found*, marks it
  used, settles the claim.

Money is confirmed on the server, in exactly those two places. That is
where an account is activated, an order marked paid, and — if you use Meta
ads — where `Purchase` is sent to the Conversions API. **Never in the
browser**, and never on the popup's Submit: most submits are a number typed
with no money sent, and an ad platform optimised toward them buys you
exactly those people (RECIPE.md §6).

---

## 1. `POST /payment-claim` — the popup's submit

Request (what the kit sends, `PaymentClaim`):

```json
{
  "method":    "bkash",             // bkash | nagad | rocket | bank
  "reference": "01712345678",       // bkash/nagad: the SENDER number, canonical 01XXXXXXXXX
                                    // rocket: 10-char TrxID, upper-case · bank: 4–40 chars A-Z 0-9 / -
  "amount":    2950,                // what the visitor was told to send
  "lead":      { "name": "রহিম উদ্দিন", "phone": "01712345678" },   // the order form; "" when off
  "popupKey":  "annual"             // the checkout this belongs to (a plan, an order id)
}
```

Do: re-validate (`parseClaim` — the same rules as the browser), store a
**pending claim** (or write the reference onto the existing order), attach
it to whatever it pays for. One open claim per `popupKey + method +
reference`: a resubmit edits, it does not duplicate.

Reply `200 {"ok": true, "claimId": 812}`. A `4xx` with `{"error": "বাংলায়
কারণ"}` is shown under the popup's field and the form stays.

## 2. `POST /payment-claim/check` — "did the money arrive?"

Same body as §1. Polled every 8 s for 2 minutes (bank: once). Reply:

```json
{ "found": true,  "amount": 2950, "gateway": "BKASH", "underpaid": false }
{ "found": false }                          // keep polling
{ "found": false, "throttled": true }       // over the hourly limit
{ "found": false, "verifier": "off" }       // auto-verify switched off
{ "found": false, "verifier": "stale" }     // no SMS relayed for 12 h — the phone may be off
```

Do, in order:

1. **Rate-limit**: 60 checks per claim (or per lead phone) per hour →
   `throttled`.
2. **Settled already?** The webhook matched this claim (status approved /
   verified) → `found` with the paid amount.
3. **In the pool?** An unused received payment that fits the claim
   (`paymentMatchesClaim`: same keys as §3) → mark it used, settle the
   claim, confirm the money (your seam) → `found`.
4. Otherwise `found: false`, plus `verifier` when you **cannot know**: the
   verifier is off in settings, or the app has not posted anything for 12
   hours. The popup then says "being checked", never "not received".

`underpaid: true` (received below the floor of §4) still reports *found* —
the popup says the money came; you hold the order for a human, as the
app does.

## 3. `POST /lead` — the order form, while they type *(optional)*

```json
{ "name": "রহিম উদ্দিন", "phone": "01712345678", "stage": "typed", "method": "bkash", "amount": 2950,
  "reference": "01712345678",   // only at stage "paid"
  "whatsapp": true }            // only on a WhatsApp tap; not a stage
```

Fired 700 ms after a valid number is typed (`typed`), when the popup opens
(`checkout`), at submit (`paid`). One row per phone; **the furthest stage
wins** — the page re-reports `typed` on later keystrokes and a `paid` lead
must not be demoted. Silent `{"ok": false}` for an invalid number: a
half-typed number is the normal case, not a fault. This table is your call
sheet for whoever never finished.

## 4. `POST /smartpay/payment` — the SmartPay Auto Verify app

The app reads the payment SMS on the receiving phone and posts it here
within seconds. **Exactly** what it sends (a real bKash payment, from the
app's guide):

```http
POST /api/smartpay/payment
Content-Type: application/json
Accept: application/json
Authorization: Bearer <SMARTPAY_SECRET>
Idempotency-Key: DIF8IFIRKK

{
  "amount": 500.0,
  "txn_id": "DIF8IFIRKK",
  "sender": "01856189587",
  "gateway": "BKASH",
  "reference": "",
  "timestamp": 1789448820,
  "sender_masked": "",
  "sender_prefix": "",
  "sender_suffix": "",
  "txn_id_synthetic": false,
  "tolerance_over_flat": 30.0,
  "tolerance_over_percent": 2.0,
  "tolerance_under_flat": 1.0
}
```

| field | meaning |
|---|---|
| `gateway` | `BKASH` · `NAGAD` · `ROCKET` · `UNKNOWN` |
| `sender` | the paying number, full — bKash personal, Nagad *Money Received*. **Empty** for bKash merchant payments (masked), Nagad *Cash In* (the number is the agent's, deliberately not sent), Rocket (masked) |
| `sender_masked` / `sender_prefix` / `sender_suffix` ⭐ | bKash **merchant** payments show `0171XXXXX328`: the app sends `0171` and `328`. Match on **both** — §3 |
| `txn_id` | the TrxID printed in the SMS — the key for Rocket and bank |
| `txn_id_synthetic` ⭐ | `true`: the SMS printed **no** TrxID and the app derived a stable one. The customer never saw it — **never match on it**; reply `not_found`, pool it, a human reconciles |
| `reference` | the wallet's "Reference" field. Informational only — **never match on it** (customers leave it empty or wrong) |
| `timestamp` | unix seconds when the app processed the SMS |
| `tolerance_*` | the app's amount settings, on every request, so the site and the app agree without a deploy — §4 |
| `Idempotency-Key` header | `= txn_id`. The same key twice must not approve twice |

Also: `{"test": true}` (or an empty body) is the app's **"test
connection"** button — answer `200 {"status":"success","message":"…"}`.

### What to do

1. `401` unless `Authorization` matches your secret (constant-time compare).
   Record "last event at" — the popup's `verifier: stale` reads it.
2. **Idempotency**: seen this `txn_id` with a settled reply → return that
   reply. A `not_found` is **not** cached — a claim may arrive later.
3. **Find the claim** (§3 below). None → **pool** the payment (`used =
   false`) and reply `not_found`.
4. **Judge the amount** (§4) → `approved` / `hold_short` / `hold_excess`.
5. Settle the claim (status, paid amount, gateway, TxnID, note), mark the
   payment used, **confirm the money** (your seam) — and reply:

```json
{
  "matched":         true,
  "site":            "ABC Shop",          // shown beside the payment in the app
  "order_id":        812,
  "order_number":    "812",
  "order_status":    "approved",          // or "on-hold"
  "action":          "approved",          // approved | hold_short | hold_excess | rejected | not_found
  "expected_amount": 2950.00,
  "note":            "সঠিক পরিমাণ — অনুমোদিত"   // what the person holding the phone reads
}
```

HTTP `200` whether matched or not. `action` colours the app's payment
screen (green approved · yellow hold · red rejected · grey not_found); a
`2xx` **without** this JSON is recorded as `legacy_ok` — "unclear answer",
payment listed for review. So always send the JSON.

**Never redirect this route.** The app does not follow redirects (a
redirected `POST` becomes an empty `GET` that the site answers `200` to —
and the payment is lost). Give the app the exact final `https://` URL, no
trailing-slash games. HTTPS is mandatory; the app refuses cleartext.

## 5. Which claim is this payment for? (`findClaimForPayment`)

The **key is what the customer typed in the popup** — never the amount,
never the SMS's reference field. In order of trust:

| # | key | who |
|---|---|---|
| 1 | the typed **TrxID** = `txn_id` (case, spaces, dashes ignored) | Rocket, bank |
| 2 | the typed **sender number**, last 10 digits = `sender` | bKash personal, Nagad Money Received |
| 3 | typed number **starts with** `sender_prefix` **and ends with** `sender_suffix` — and **exactly one** claim fits; two fit → **no match, hold** | bKash merchant (masked) |
| 4 | the order form's own phone = `sender` (they paid from their own SIM and typed nothing, or the wrong thing) | fallback |

Several claims in one tier → the one **closest in amount** (two pending
orders from one customer). Only `pending` claims. A synthetic TrxID is
never looked up. A Nagad SMS may settle a claim made under the bKash tab —
the number is the key, not the tab.

> Why prefix+suffix: bKash masks the sender on merchant payments. Before
> the app sent the two ends, **every** bKash merchant payment came back
> `not_found` — that was the single biggest reason money arrived and nothing
> activated. And why "exactly one": money cannot be un-sent, but one order
> can be approved by hand.

## 6. Is the amount right? (`judgeAmount`)

Customers do not send the exact figure: ৳1,000 for a ৳950 plan, ৳1,020 to
cover the cash-out fee, ৳500 as a part payment, ৳5,000 by mistake.

```
ceiling = expected + max(overFlat, expected × overPercent)     (app defaults: ৳30, 2 %)
floor   = expected − underFlat                                   (app default: ৳1)

received > ceiling → hold_excess   (probably someone else's money — a human looks)
received < floor   → hold_short    (hold + a note saying how much is missing)
otherwise          → approved
```

Use the `tolerance_*` the app sent; the constants are only the fallback.
Under is never silently accepted; over is held too — one payment must not
deliver two orders.

## 7. Wire the app

In the SmartPay Auto Verify app: **Config → new integration**

| field | value |
|---|---|
| Type | `GENERIC_WEBHOOK` |
| URL | the exact final URL, e.g. `https://your-site.com/api/smartpay/payment` |
| Auth Key | your `SMARTPAY_SECRET` (the app adds `Bearer ` itself) |
| Name | the site's name — shown on every payment |

Then **Settings → Amount matching** should agree with your fallback
constants, and a small real payment should show the site name and the
order number in the app's Payments tab.

Test the endpoint before touching the app — make a pending claim for
`01712345678`, then:

```bash
curl -X POST https://your-site.com/api/smartpay/payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Idempotency-Key: TEST001" \
  -d '{"amount":2950,"txn_id":"TEST001","sender":"01712345678","gateway":"BKASH","reference":"","timestamp":1700000000}'
```

Expect `{"matched":true,"action":"approved",...}`. `not_found` means the
claim was not stored where §5 looks.

The app itself (APK, source, the full guide with every verified SMS
format): <https://github.com/developeralamin45/Auto-Payment-Verify-Apps>.

## 8. Edge cases you will meet

| situation | what happens | what to keep in mind |
|---|---|---|
| Nagad **Cash In** at an agent | `sender` is empty (the number in the SMS is the agent's) | only a typed TrxID can match; else it pools for a human |
| Rocket | the SMS masks the number | the popup **requires** the TrxID for Rocket — that is why |
| bank credit with no TrxID | `txn_id_synthetic: true` | pool, reply `not_found`, reconcile by hand — but the money is now *visible* |
| paid from someone else's wallet | matches only if they typed *that* number | the popup's label says "the number you sent **from**", on purpose |
| typo in the TrxID | no match, pools | `normalizeTxn` fixes case/spaces, not missing characters |
| two pending orders, same customer | closest amount wins | salt the amounts (৳1,000.03) if this bites |
| the phone was off | the app rescans the inbox on boot (7 days back) | older SMS are gone; **do** keep the pool ≥ 7 days |
| same TxnID twice | idempotency key | return the stored reply, never a second approval |
| the app's parser fails on a new SMS format | the app logs `PARSE_FAILED` in its SMS tab | the fix is a test + regex in the app repo, not on the site |

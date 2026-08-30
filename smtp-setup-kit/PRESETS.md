# Presets — choosing and extending the catalogue

The catalogue (`config/email_events.php`) is what makes one kit fit every
project. This page is the reference for picking a preset and shaping it.

---

## Pick a preset

| Preset | Choose it when the codebase has | Adds on top of the common events |
|---|---|---|
| `saas` | `Subscription`, `Plan`, `Invoice`, tenants, trials | payment received, trial ending, subscription expired, invoice, new-signup alert |
| `ecommerce` | `Order`, `Cart`, `Product`, shipping/status fields | order placed / confirmed / shipped / delivered / cancelled / refunded, payment received & failed, abandoned cart, new-order alert |
| `organization` | a contact form, appointments, notices — no orders or plans | enquiry received & acknowledged, appointment confirmed & reminder, general notice |
| `custom` | none of the above describes it | whatever you declare |

Every preset also gets the **common** events, so you never redeclare them:

- `account.welcome`
- `account.otp` *(critical)*
- `account.password_reset` *(critical)*
- `account.password_changed`

Set the choice in `.env`:

```dotenv
EMAIL_PRESET=ecommerce
```

---

## Shape it to the real project

A preset is a **starting point, not an answer**. Before you ship:

**Delete what cannot happen.** If there is no cart model, `cart.abandoned` can
never fire. An admin scrolling past emails that do nothing stops believing the
rest of the panel is real.

**Add what the project actually does.** Read every status enum and state
transition in the code — `Order::STATUS_*`, `ticket.status`, an approval
workflow, a KYC step. Each transition a human would want to hear about is an
event. Name it `noun.past_tense_verb`, matching the existing keys.

**Be honest about `critical`.** It means *a person is stuck until this email
arrives*: OTP, password reset, a magic login link. It bypasses quiet hours and
the duplicate filter. Marking a shipping notice critical does not make it
important — it just makes quiet hours meaningless.

**Write the wording in the product's voice and language.** Copy the tone of the
existing user-facing strings. Placeholders stay ASCII snake_case even when the
copy is not English:

```php
'subject' => 'আপনার অর্ডার #{order_id} পাঠানো হয়েছে',
```

---

## Anatomy of an event

```php
'order.shipped' => [
    'label'    => 'Order shipped',        // shown in the admin list
    'group'    => 'Orders',               // section heading it appears under
    'audience' => 'user',                 // 'user' | 'admin' — documentation
    'critical' => false,                  // true = bypasses quiet hours + dedupe
    'default_enabled' => true,            // state the seeder creates it in
    'variables' => [                      // {placeholder} => tooltip text
        'name'         => 'The name of the customer',
        'order_id'     => 'Order number',
        'tracking_url' => 'Courier tracking link',
    ],
    'subject' => 'Order #{order_id} is on the way',
    'body'    => '<p>Hi {name},</p>
<p><a class="btn" href="{tracking_url}">Track shipment</a></p>',
],
```

Then fire it from wherever the state actually changes:

```php
app(EmailDispatcher::class)->fire('order.shipped', $order->email, [
    'name'         => $order->customer_name,
    'order_id'     => $order->id,
    'tracking_url' => $shipment->tracking_url,
]);
```

### Rules that are easy to get wrong

- **`{app_name}` is free** — injected into every template; never declare it.
- **A placeholder you do not pass renders empty**, never as literal `{name}`.
  Empty reads as terse; `{name}` reads as broken. Still, pass them all.
- **Two helper classes are styled by the layout**: `class="btn"` on a link makes
  a button, `class="code"` makes a large monospace OTP block.
- **The body is HTML**, wrapped automatically in the branded layout — do not put
  `<html>` or a header/footer in it.
- **`group` invents itself.** Any new group string becomes a new section in the
  admin panel; keep the set small and obvious.

---

## Writing a custom catalogue

```php
'preset' => env('EMAIL_PRESET', 'custom'),

'presets' => [
    'custom' => [
        'ticket.replied' => [
            'label'    => 'Support ticket replied',
            'group'    => 'Support',
            'audience' => 'user',
            'critical' => false,
            'default_enabled' => true,
            'variables' => [
                'name'       => 'The name of the person',
                'ticket_id'  => 'Ticket number',
                'reply'      => 'What the agent wrote',
                'ticket_url' => 'Link to the ticket',
            ],
            'subject' => 'Re: ticket #{ticket_id}',
            'body'    => '<p>Hi {name},</p><p>{reply}</p>
<p><a class="btn" href="{ticket_url}">View ticket</a></p>',
        ],
    ],
],
```

After adding events, create their editable rows:

```bash
php artisan db:seed --class=EmailTemplateSeeder
```

Safe on every deploy — it only inserts events that have no row yet and never
overwrites wording an admin has edited.

---

## Mixing two presets

Nothing stops you. A SaaS that also sells hardware wants both catalogues:

```php
'presets' => [
    'custom' => array_merge(
        require __DIR__ . '/email_events_saas.php',
        require __DIR__ . '/email_events_shop.php',
    ),
],
```

Keep the keys unique — a duplicate key silently wins the later array, and you
will spend an afternoon wondering why an email says the wrong thing.

# 📧 SMTP Setup Kit

Everything you need to make an app send email, and keep sending it: SMTP setup
**plus the Gmail API path that keeps working when your host blocks SMTP ports**,
and the whole system around it — which emails exist, what they say, whether
they go out at all, and when.

**Laravel backend · React + TypeScript admin UI · MIT · free for anyone.**

---

## What you get

**For the developer — one line per email, forever:**

```php
app(EmailDispatcher::class)->fire('order.shipped', $customer->email, [
    'name' => $customer->name, 'order_id' => $order->id, 'courier' => 'Pathao',
]);
```

No Mailable class. No Blade file. No deploy when the wording changes.

**For the admin — a panel where they control it themselves:**

- **Every email in one list**, grouped by area, each with an on/off switch
- **Edit subject and body** with click-to-insert `{placeholders}`, preview with
  realistic sample data, send a real test to yourself, reset to the default
- **Quiet hours** — "don't email customers at 2am". Held mail is *queued*, not
  dropped, and released when the window opens
- **Duplicate suppression** — a double-clicked button stops sending two emails
- **Delivery setup** with a built-in A-to-Z credentials guide a non-technical
  person can finish alone
- **This month's numbers** — sent, failed, skipped, success rate, top events

**And the production problem nobody warns you about, solved:**

> Most hosts — DigitalOcean, plenty of VPS and shared hosts — **block outbound
> SMTP ports**. Your email works perfectly on your laptop and silently dies on
> the live server. This kit sends through the **Gmail API over HTTPS (port
> 443)**, which nothing blocks, and keeps SMTP as the fallback.

---

## Two ways to use it

### 🤖 Hand it to your AI agent

Copy this into your agent — the link plus one sentence is all it needs:

```
Read https://github.com/developeralamin45/Public-Resource-For-Vibe-Coding/tree/main/smtp-setup-kit
and implement it in this project. Follow its RECIPE.md: inspect my codebase
first, adapt it to what this project actually is, then tell me what I need to
do myself.
```

[`RECIPE.md`](./RECIPE.md) tells the agent to inspect the codebase first and
*fit the catalogue to what the project actually is* — order emails for a store,
billing emails for a SaaS, appointment emails for a clinic — then hand you a
short setup checklist at the end.

### 🧑‍💻 By hand

Copy `backend-laravel/` into your Laravel app and `frontend-react/` into your
admin UI, then follow [`RECIPE.md`](./RECIPE.md) from Phase 1.

---

## What's in the box

```
RECIPE.md        ← the implementation brief (agents + humans)
CREDENTIALS.md   ← where every credential goes, written for a non-developer
PRESETS.md       ← choosing and extending the event catalogue

backend-laravel/
├── config/email_events.php          THE CATALOGUE — presets: saas / ecommerce / organization
├── Services/
│   ├── EmailDispatcher.php          events, on/off, quiet hours, rendering, logging
│   └── MailService.php              transport: Gmail API (443) + SMTP fallback (587→465)
├── Models/                          SystemSetting · EmailTemplate · EmailLog · EmailOutbox
├── Http/Controllers/                EmailSettingsController · EmailTemplateController
├── Mail/                            RenderedMail (one Mailable for every event) · TestEmail
├── Console/Commands/                FlushEmailOutbox (releases queued mail)
├── views/emails/layout.blade.php    the branded, email-client-safe wrapper
├── database/                        4 migrations + EmailTemplateSeeder
└── routes.example.php

frontend-react/
├── EmailAdminTabs.tsx        both panels, one import
├── EmailTemplatesPanel.tsx   the catalogue: toggles, editor, preview, per-event test
├── EmailSettingsPanel.tsx    credentials, schedule, analytics, outbox, test send
├── GmailApiGuideModal.tsx    the A-to-Z setup guide
├── types.ts                  the full API contract
└── demo/App.tsx
```

## Quick start

```bash
# after copying the files (see RECIPE.md Phase 1)
php artisan migrate
php artisan db:seed --class=EmailTemplateSeeder
```

```tsx
import { EmailAdminTabs } from "@/components/email/EmailAdminTabs";

<EmailAdminTabs http={api} brandName="Acme" />   // `api` = your authed client
```

```php
// routes/console.php — required for quiet hours
Schedule::command('email:flush-outbox')->everyFiveMinutes();
```

Then open the panel, hit **Setup guide**, and follow it —
[`CREDENTIALS.md`](./CREDENTIALS.md) is the same walkthrough in writing.

---

## Design decisions worth knowing

- **`fire()` never throws.** A mail server having a bad day must not roll back
  an order. Failures are logged and shown in the panel.
- **`skipped` is logged like `sent` and `failed`.** When an admin asks why a
  customer got nothing, "you switched that off" is an answer; a silent gap is
  not.
- **Quiet hours queue, never drop.** Held mail lands in `email_outbox` with a
  release time, visible and cancellable in the panel.
- **Critical events ignore all of it.** Nobody waits until 8am for a password
  reset. Only OTP-class emails are marked critical.
- **Secrets are write-only.** The API never returns a saved credential to the
  browser; an empty box means "keep it", not "erase it".
- **The seeder never overwrites edited wording.** It only inserts events that
  have no row, so it is safe on every deploy.

## Notes

- The Gmail OAuth app **must be Published (Production)** — in Testing mode
  Google expires the refresh token after 7 days, and mail stops with no warning.
  The setup guide flags this loudly.
- Gmail sends roughly **500 recipients/day** free, ~2,000 on Workspace. For bulk
  newsletters use SES / Postmark / Resend instead — this kit is for
  transactional mail.
- Keep the routes behind **admin authentication**. They read and write mail
  credentials.

## License

MIT — use it anywhere, including commercial projects.

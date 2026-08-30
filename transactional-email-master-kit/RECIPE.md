# RECIPE — implementing the transactional email system

**You are an AI coding agent. This file is your brief.** Read it end to end
before touching anything, then work through the phases in order.

Your job is **not** to copy files verbatim. It is to give this project a
working, admin-controlled email system that fits *what this project actually
is*. An e-commerce store needs order emails; a SaaS needs billing emails; a
clinic site needs appointment emails. Same machinery, different catalogue.

---

## Phase 0 — Understand the project before you copy anything

Answer these from the codebase, not from assumptions:

1. **What kind of product is this?** Look at the models, routes and migrations.
   `Order`, `Cart`, `Product` → e-commerce. `Subscription`, `Plan`, `Invoice`,
   tenants → SaaS. Neither, plus a contact form → organisation/brochure site.
2. **What is the stack?** Laravel version, and does the frontend admin use
   React + Tailwind? If not, the backend still applies — you will need to build
   the admin UI in whatever the project uses (see Phase 5).
3. **Does mail already exist here?** Grep for `Mail::`, `Mailable`, `Notification`,
   `MAIL_MAILER`. If there is an existing mail path, you are **replacing** it,
   not running a second one alongside.
4. **Is there already a settings table?** Grep for `system_settings`, `settings`,
   `options`. If one exists, use it and drop this kit's `SystemSetting` model +
   migration.
5. **What does admin auth look like?** Find the middleware that guards the
   existing admin routes. You will reuse it exactly.
6. **Which language is the UI in?** All copy in the React components is English
   plain text. If the project's admin panel is in another language, translate it
   as you go — do not leave a mixed-language panel.

**Then tell the human what you found and what you are about to do**, in three or
four lines. If the project type is genuinely ambiguous, ask — that one answer
decides the whole catalogue.

---

## Phase 1 — Copy the backend

Files map like this (adjust namespaces if the project does not use `App\`):

```
backend-laravel/config/email_events.php            → config/email_events.php
backend-laravel/Services/*.php                     → app/Services/
backend-laravel/Models/*.php                       → app/Models/
backend-laravel/Http/Controllers/*.php             → app/Http/Controllers/  (or .../Api/)
backend-laravel/Mail/*.php                         → app/Mail/
backend-laravel/Console/Commands/*.php             → app/Console/Commands/
backend-laravel/views/emails/layout.blade.php      → resources/views/emails/layout.blade.php
backend-laravel/database/migrations/*.php          → database/migrations/   (RENAME — see below)
backend-laravel/database/seeders/*.php             → database/seeders/
```

**Rename the migrations** to today's date so they run after the project's
existing ones: `2024_01_01_000001_…` → `2026_08_30_120001_…`, keeping the
relative order (system_settings → email_templates → email_logs → email_outbox).

**Skip what the project already has.** If `SystemSetting` (or equivalent)
exists, delete this kit's copy and change the `use` statements in
`MailService`, `EmailDispatcher` and `EmailSettingsController` to point at the
project's model. All three only call `whereIn('key',…)->pluck('value','key')`
and `updateOrCreate(['key'=>…],['value'=>…])`.

---

## Phase 2 — Build the catalogue for THIS project

This is the phase that matters most, and the one you must not rush.

Open `config/email_events.php` and set the preset from Phase 0:

```php
'preset' => env('EMAIL_PRESET', 'ecommerce'),
```

Now **read the preset's events against the real codebase** and make them match:

- **Delete events the project has no concept of.** No `cart` model → delete
  `cart.abandoned`. An admin scrolling past emails that can never fire loses
  trust in the whole panel.
- **Add the events this project does have.** Look at every status enum and state
  transition in the code — an `Order::STATUS_*` list, a `ticket.status` column,
  an approval workflow — and ask which of those transitions a human would want
  to hear about. Those are your events. Follow the existing naming:
  `noun.past_tense_verb`.
- **Set `critical => true` on anything a person is blocked on**: OTP, password
  reset, a login link. Nothing else. Critical mail bypasses quiet hours and the
  duplicate filter, so over-using it defeats the schedule entirely.
- **Write the default wording in the project's own voice and language.** Copy
  the tone of existing user-facing strings. Keep `{placeholders}` in ASCII
  snake_case even when the copy is not English.
- **List every placeholder in `variables`** with a description a non-technical
  admin can read. That description is the tooltip on the chip they click.

If nothing fits, set `'preset' => 'custom'` and write the catalogue under
`presets.custom`. See [PRESETS.md](./PRESETS.md) for how to choose and extend.

---

## Phase 3 — Wire the routes

Copy the block from `routes.example.php` into the project's routes file and
**replace the middleware with the project's real admin guard** found in Phase 0.

> These endpoints read and write mail credentials. If you leave them
> unauthenticated, anyone can point the sending account at themselves. Never
> mount them outside an admin guard, and never on a public route file.

Register the outbox flusher on the scheduler — without it, every email that
quiet hours holds back is stranded forever:

```php
// Laravel 11+: routes/console.php     |  Laravel ≤10: app/Console/Kernel.php
Schedule::command('email:flush-outbox')->everyFiveMinutes();
```

Confirm the project has a real cron entry running `schedule:run`. If it does
not, say so — quiet hours cannot work without one, and the honest fallback is
to leave quiet hours switched off.

---

## Phase 4 — Replace the project's existing send calls

Every place the app currently sends mail becomes one line:

```php
app(\App\Services\EmailDispatcher::class)->fire('order.shipped', $order->customer_email, [
    'name'         => $order->customer_name,
    'order_id'     => $order->id,
    'courier'      => $shipment->courier,
    'tracking_no'  => $shipment->tracking_number,
    'tracking_url' => $shipment->tracking_url,
    'eta'          => $shipment->eta->toFormattedDateString(),
]);
```

Rules to follow while you do it:

- **`fire()` never throws.** Do not wrap it in try/catch, and do not let a mail
  result decide whether an order is saved. That is the point of it.
- **Pass every placeholder the event declares.** A missing one renders as empty
  — which reads as sloppy, not as broken, but it is still wrong.
- **Delete the old Mailable + Blade file** once its event is live. Leaving both
  means the next person edits the file that no longer sends.
- **Fire from where the state actually changes** (the service/action that
  transitions the order), not from a controller, or the email will be missing
  whenever that transition happens from a job, a webhook or an admin screen.
- **Never fire inside a loop over thousands of rows** in a web request. Queue it.

---

## Phase 5 — The admin UI

**React + Tailwind project:** copy `frontend-react/` into the admin area and
render one component:

```tsx
import { EmailAdminTabs } from "@/components/email/EmailAdminTabs";

<EmailAdminTabs http={api} brandName="Acme" />
```

`http` must be the project's own API client with its auth interceptor already
attached. Override `endpoints` if you mounted the routes on different paths.
Then translate the UI copy if the panel is not in English.

**Any other frontend:** do not fake it with a React island. Build the same two
screens natively (Blade/Vue/Livewire/Inertia) against the same endpoints — the
API contract is in `frontend-react/types.ts`. Keep both screens: the catalogue
list with per-event toggles, and the delivery settings with the setup guide.
The guide is what lets the human finish alone; dropping it is what turns this
into a support ticket.

---

## Phase 6 — Migrate, seed, verify

```bash
php artisan migrate
php artisan db:seed --class=EmailTemplateSeeder
php artisan config:clear
```

The seeder only inserts events that have no row yet, so it is safe on every
deploy and never overwrites the admin's edited wording.

Verify, and **report honestly what you actually observed** — if you could not
run something, say that instead of assuming it passed:

- [ ] `php artisan route:list | grep email` shows the routes, all behind admin auth
- [ ] The admin panel loads and lists the catalogue grouped by area
- [ ] Toggling an event off, then firing it, writes a `skipped` row in `email_logs`
- [ ] Preview renders with sample data and no visible `{placeholders}`
- [ ] A test email arrives (this is the only proof the credentials work)
- [ ] Quiet hours on + a non-critical event → a row in `email_outbox`, not a send
- [ ] `php artisan email:flush-outbox` delivers that row
- [ ] A critical event (OTP) still sends instantly during quiet hours

---

## Phase 7 — Hand the human their checklist

The code cannot finish this alone: someone with access to the sending account
has to create the credentials. **End your work by printing exactly what they
must do**, in their language, in this shape:

> **Your turn — about 10 minutes, once.**
>
> 1. Open the admin panel → **Email → Delivery setup**.
> 2. Set **Sender email** and **Sender name**.
> 3. Click **Setup guide** and follow the three steps — it walks you through
>    Google Cloud and gives you a Client ID, Client secret and Refresh token.
> 4. Paste those three values, **Save**, then **send yourself a test email**.
> 5. Once it arrives, go to the **Emails** tab and switch off anything you do
>    not want customers to receive.
>
> Add these to `.env` if you want branding on the emails:
> `EMAIL_PRESET`, `EMAIL_LOGO_URL`, `EMAIL_ACCENT`, `EMAIL_FOOTER_NOTE`.

Full detail for them lives in [CREDENTIALS.md](./CREDENTIALS.md) — point them at
it, and copy it into the project's own docs folder so it does not get lost.

Also tell them plainly:

- which preset you chose and **which events you added or removed**;
- that **Gmail free sends ~500/day** (Workspace ~2,000) — if they plan bulk
  newsletters, they need SES/Postmark/Resend instead;
- that the OAuth app **must be Published**, or mail dies after 7 days;
- **whether a cron for `schedule:run` exists**, because quiet hours depend on it.

---

## Things that will bite you

| Symptom | Cause |
|---|---|
| Works locally, times out in production | Host blocks outbound SMTP. Use the Gmail API path — that is what it is for. |
| Email stopped after exactly 7 days | The OAuth consent screen was never published to Production. |
| `redirect_uri_mismatch` on the Playground | The redirect URI was not added to the OAuth client first. |
| Auth fails with a token that looks right | They copied the `4/0…` authorization code, not the `1//…` refresh token. |
| Nothing sends, no errors | Every event is off, or the seeder never ran. Check `email_logs` for `skipped`. |
| Queued mail never arrives | No cron running `schedule:run`, so `email:flush-outbox` never fires. |
| A saved credential vanished after an edit | You changed the API to treat a blank secret as "erase". Blank means "keep". |
| Bangla/Arabic subject arrives as `=?UTF-8?…` | Header encoding was bypassed. Keep `encodeMimeWord`. |

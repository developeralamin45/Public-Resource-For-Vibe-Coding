# RECIPE — Email Setup (Gmail API + SMTP fallback) with Admin Panel

> **For the AI agent implementing this in another project.** This kit gives a
> complete, admin-managed transactional-email system: a super-admin panel
> (analytics + settings form + one-click setup guide + test sender) backed by a
> `MailService` that sends via the **Gmail API over HTTPS** (primary) and falls
> back to **Gmail SMTP** (587→465). Keep the UI + guide "same to same".

---

## 1. Why Gmail API first (not plain SMTP)

Many hosts — **DigitalOcean, and various shared/VPS providers** — block outbound
SMTP ports (25/465/587) to fight spam. Plain SMTP mail then silently fails in
production even though it worked locally. The Gmail **API** sends over HTTPS
(443), which is never blocked. So this kit uses the API when OAuth credentials
are present, and only falls back to SMTP otherwise. **Keep this design** — it's
the whole reason the kit exists.

## 2. Stacks

- **Frontend:** React + TypeScript. Deps: `react`, `lucide-react`. Tailwind
  classes for styling (works without Tailwind, just restyle).
- **Backend:** Laravel 9+ (uses Mailable `htmlString`, `Http` client, Symfony
  Mailer — all bundled with Laravel). No extra composer packages.
- Not Laravel? See §7 — the logic ports to any backend; the frontend is unchanged.

## 3. Files

**Frontend** → copy into e.g. `src/components/email/`:
```
EmailSettingsPanel.tsx   ← the admin screen (analytics + form + test)
GmailApiGuideModal.tsx   ← the A-to-Z setup guide (opened from the panel)
demo/App.tsx             ← usage example (reference only)
```

**Backend** → copy into the matching Laravel folders:
```
Services/MailService.php                 → app/Services/
Http/Controllers/EmailSettingsController.php → app/Http/Controllers/
Models/SystemSetting.php                 → app/Models/  (skip if you have a settings table)
Models/EmailLog.php                      → app/Models/
Mail/TestEmail.php                       → app/Mail/
migrations/*.php                         → database/migrations/  (skip system_settings if you have one)
routes.example.php                       → merge into routes/api.php
```

## 4. Install (backend)

1. Copy the files above. Adjust namespaces if your app root isn't `App\`.
2. `php artisan migrate` (creates `system_settings` + `email_logs`).
3. Add the routes from `routes.example.php` **inside your admin middleware group**.
4. Set `config/mail.php` / `.env` `MAIL_FROM_ADDRESS` + `MAIL_FROM_NAME` as
   sensible defaults (DB values from the panel override them at runtime).
5. Send anywhere in your app via the service:
   ```php
   app(\App\Services\MailService::class)->send($user->email, new WelcomeEmail(), 'welcome');
   ```
   The `type` string (`welcome | reset | test | otp | other`) drives the
   analytics cards — pass the right one.

## 5. Install (frontend)

Render the panel inside your super-admin area, passing your axios instance:

```tsx
import axios from "axios";
import { EmailSettingsPanel } from "@/components/email/EmailSettingsPanel";

const api = axios.create({ baseURL: "/api" }); // your existing client

<EmailSettingsPanel
  http={api}
  brandName="Your Brand"
  oauthRedirectUri="https://developers.google.com/oauthplayground"
/>
```

`http` just needs `.get(url)` and `.post(url, body)` returning `{ data }` (axios
shape). Override route paths with the `endpoints` prop if yours differ from the
defaults (`/system-core/email-*`).

## 6. The seams (what changes per project)

| Seam | Where |
|---|---|
| API route prefix/paths | `endpoints` prop (frontend) + `routes.example.php` (backend) |
| Admin authorization | your middleware around the routes (`is_admin` placeholder) |
| Brand name / OAuth redirect URI shown in guide | `brandName`, `oauthRedirectUri` props |
| Default from address/name | `config/mail.php` (overridden by the panel) |
| Settings storage | reuse your own settings table → adjust `SystemSetting` |
| Welcome/reset/OTP emails | your own Mailables; call `MailService::send($to, $mailable, $type)` |

## 7. Backend contract (for non-Laravel ports)

Implement four admin-only endpoints; the frontend needs exactly these shapes:

- `GET  {analytics}`     → `{ welcome_emails_sent, active_password_resets, total_emails_sent, total_emails_failed }`
- `GET  {getSettings}`   → `{ smtp_from_address, smtp_from_name, require_email_verification:bool, gmail_client_id, gmail_client_secret, gmail_refresh_token, gmail_api_enabled:bool }`
- `POST {saveSettings}`  body = the settings object → `{ message }`
- `POST {testEmail}`     body `{ email }` → `{ message }` (200) or `{ message }` (500 on failure)

The send logic (port MailService): if a Gmail refresh token + client id/secret
exist → exchange the refresh token at `https://oauth2.googleapis.com/token`, build
a raw RFC-822 message (URL-safe base64, no padding), POST to
`https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with the access
token. Else → SMTP `smtp.gmail.com` trying 587 (STARTTLS) then 465 (SSL). Log
every attempt.

## 8. GOTCHAS — keep these, they're the hard-won details

- **Gmail OAuth app MUST be "Published" (Production), not "Testing".** In Testing
  mode Google expires the refresh token after **7 days** and email silently dies.
  The guide's step 1 flags this in red — keep it.
- **Refresh token starts with `1//`**, not `4/0…` (that's the one-time auth code).
  Users constantly paste the wrong one — the guide calls this out.
- **Scope is exactly** `https://www.googleapis.com/auth/gmail.send`.
- **Never wipe the SMTP password** when the field is submitted empty — the
  controller only overwrites it when a new value is provided.
- **Subject/sender name are MIME-encoded** (`=?UTF-8?B?…?=`) so non-ASCII (Bangla,
  emoji) headers don't break.
- **Short SMTP connect timeout (12s)** so a blocked port fails fast and the
  fallback runs, instead of hanging ~60s.
- **Credentials are secrets.** The routes must sit behind admin auth; never log
  the client secret / refresh token; keep the repo storing real values private.

## 9. Verify after implementing

1. Admin panel loads; analytics cards show this month's counts.
2. "সেটআপ গাইড" opens the 3-part modal with your brand name + redirect URI.
3. Save settings → success toast; reopen → values persist (secrets masked).
4. Test email to your own inbox arrives; a row appears in `email_logs` as `sent`.
5. Break a credential on purpose → test fails gracefully with an error toast and
   a `failed` row with `error_message`.
6. Deploy to a host that blocks SMTP → email still sends (API path over 443).

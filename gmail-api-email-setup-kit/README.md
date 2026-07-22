# 📧 Email Setup Kit — Gmail API + SMTP fallback, with Admin Panel

A complete, admin-managed transactional-email system you can drop into any
project: a polished **super-admin panel** (this-month analytics, settings form,
one-click **A-to-Z setup guide**, and a test-email sender) backed by a
`MailService` that sends via the **Gmail API over HTTPS** — so mail keeps working
even on hosts (DigitalOcean etc.) that **block SMTP ports**.

**React + TypeScript frontend · Laravel backend · MIT · free for anyone.**

---

## Why this exists

Every app needs to send welcome / password-reset / OTP emails, and every time you
rebuild the same thing — plus fight the classic production surprise: *SMTP worked
locally but the host blocks port 587/465*. This kit solves both once:

- **Gmail API first (port 443)** → never blocked; **SMTP fallback** when no API creds.
- A **non-technical admin can set it up** by following the built-in guide (Google
  Cloud OAuth → Refresh Token → paste & test) — no developer needed.

## Two ways to use it

### 🤖 Hand it to your AI agent
Point your agent at this folder (or paste [`RECIPE.md`](./RECIPE.md)) and say:

> "Add this email system to my project — same admin panel + setup guide. Follow
> RECIPE.md, wire the routes behind my admin middleware, and send my welcome/OTP
> emails through the MailService."

### 🧑‍💻 Copy by hand
Copy `backend-laravel/` into your Laravel app + `frontend-react/` into your
admin UI. Full steps in [`RECIPE.md`](./RECIPE.md).

## What's in the box

```
RECIPE.md                 ← implementation guide (humans + AI)
LICENSE                   ← MIT
frontend-react/
├── EmailSettingsPanel.tsx   analytics + settings form + test sender
├── GmailApiGuideModal.tsx   the A-to-Z setup guide
└── demo/App.tsx
backend-laravel/
├── Services/MailService.php                    Gmail API + SMTP auto-select
├── Http/Controllers/EmailSettingsController.php analytics / get / save / test
├── Models/{SystemSetting,EmailLog}.php
├── Mail/TestEmail.php
├── migrations/*                                system_settings + email_logs
└── routes.example.php
```

## Frontend quick start

```tsx
import axios from "axios";
import { EmailSettingsPanel } from "./frontend-react/EmailSettingsPanel";

<EmailSettingsPanel http={axios.create({ baseURL: "/api" })} brandName="Your Brand" />
```

## Backend quick start

```php
// send anywhere; `type` powers the analytics cards
app(\App\Services\MailService::class)->send($user->email, new WelcomeEmail(), 'welcome');
```

## Notes

- The Gmail OAuth app must be **Published (Production)** — in Testing mode Google
  expires the refresh token after 7 days. The setup guide flags this.
- Keep the settings routes behind **admin authentication** — they store mail
  credentials. Never commit real client secrets / refresh tokens to a public repo.

## License

MIT — use it anywhere, including commercial projects.

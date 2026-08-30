# Public Resource for Vibe Coding 🚀

A growing collection of **drop-in, production-ready building blocks** you can hand
to your AI coding agent (or copy by hand) to add a polished feature to any project
in minutes — no re-building from scratch, no re-sourcing assets.

Each resource is **self-contained** and ships with a `RECIPE.md` written for AI
agents: copy the files, follow the recipe, wire the few project-specific seams.

## 📦 Resources

| Resource | What it gives you | Stack |
|---|---|---|
| [**bKash · Nagad · Rocket — Send-Money Checkout**](./bkash-nagad-rocket-payment-kit/) | Pixel-faithful Bangladeshi MFS payment method picker + send-money popup, with logos bundled | React + TypeScript |
| [**Transactional Email — Master Kit**](./transactional-email-master-kit/) | The whole email system, not just the sender: a catalogue of every email your app sends, each one editable and switchable by the admin, plus quiet hours, duplicate suppression, delivery analytics and an A-to-Z credentials guide. Your agent reads your codebase and builds the right catalogue for it — order emails for a store, billing for a SaaS, appointments for a clinic | React + Laravel |
| [**Email Setup (Gmail API + SMTP fallback)**](./gmail-api-email-setup-kit/) | The minimal sender on its own: settings + setup guide + test button. Superseded by the master kit above — use this only if you want nothing but credentials and a send call | React + Laravel |
| [**Continue with Google (OAuth)**](./continue-with-google-oauth-kit/) | Secure "Continue with Google" button + server-side token verification + login/register two-step flow | React + Laravel |
| [**GitHub Actions Auto-Deploy**](./github-actions-laravel-deploy-kit/) | Push to `master` → tested, built, rsynced, migrated behind a DB backup, every cache busted. Includes the SSH-key + repository-secrets walkthrough | GitHub Actions + Laravel + Vite |
| [**Laravel Auto-Deploy — cPanel / shared hosting (no SSH)**](./cpanel-ftp-laravel-deploy-kit/) | The same push-to-live pipeline for hosting that only gives you FTP: builds on the runner, ships the release as **one zip** instead of 25,000 FTP transfers (the 30–50 minute first deploy), then unpacks and migrates through a token-protected PHP hook | GitHub Actions + Laravel + cPanel |

_More resources coming: login/registration flow, and more._

## ⚠️ Cloning on Windows

Some kits nest migration files deep enough to exceed Windows' 260-character
path limit, and `git clone` fails part-way with *"Filename too long"*. Turn the
limit off once:

```bash
git config --global core.longpaths true
```

Or clone into a short path (`C:\kits`) instead of somewhere under `Documents`.

## 🤖 How to use with an AI agent

Point your agent at the resource folder (or paste its `RECIPE.md`) and say:

> "Implement this in my project, same to same. Follow RECIPE.md and wire it to my backend."

The agent reads the recipe, copies the component + assets, and adapts the seams
(endpoints, config, labels) to your stack.

## 🧑‍💻 How to use by hand

Open the resource folder, read its `README.md` for a quick start, copy the files
into your project, and render the component.

## License

MIT (per-resource `LICENSE` included). Free for anyone — students, freelancers,
commercial projects. Third-party trademarks/logos belong to their owners and are
included only to identify the corresponding feature in the UI.

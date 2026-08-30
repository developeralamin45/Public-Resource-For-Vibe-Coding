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
| [**Transactional Email**](./transactional-email-kit/) | The whole email system, not just the sender: a catalogue of every email your app sends, each one editable and switchable by the admin, plus quiet hours, duplicate suppression, delivery analytics and an A-to-Z credentials guide. Your agent reads your codebase and builds the right catalogue for it — order emails for a store, billing for a SaaS, appointments for a clinic | React + Laravel |
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

**Copy this, swap the link for the resource you want, paste it into your agent:**

```
Read https://github.com/developeralamin45/Public-Resource-For-Vibe-Coding/tree/main/transactional-email-kit
and implement it in this project. Follow its RECIPE.md: inspect my codebase
first, adapt it to what this project actually is, then tell me what I need to
do myself.
```

That is all the prompt you need. The link alone is usually *not* enough — most
agents will not fetch a URL and start work unaccompanied — but one sentence
plus the link is, because every resource ships a `RECIPE.md` written as a brief
for the agent: what to inspect, what to decide, what to copy, and what to hand
back to you at the end.

There is also an [`AGENTS.md`](./AGENTS.md) at the repo root, which agents that
follow that convention read automatically.

**What a good resource does for you:** it does not just copy files. It reads
your models and routes, works out what kind of product you are building, and
builds the feature to fit — e-commerce gets order emails, a SaaS gets billing
emails, a clinic gets appointment reminders. Then it prints the short list of
things only a human can do (create credentials, paste keys).

## 🧑‍💻 How to use by hand

Open the resource folder, read its `README.md` for a quick start, copy the files
into your project, and render the component.

## License

MIT (per-resource `LICENSE` included). Free for anyone — students, freelancers,
commercial projects. Third-party trademarks/logos belong to their owners and are
included only to identify the corresponding feature in the UI.

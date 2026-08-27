# 🚀 Laravel Auto-Deploy for cPanel / Shared Hosting — **no SSH required**

**Push to `main` → the site is live in ~3 minutes**, on hosting that gives you
nothing but FTP and a cPanel login. Composer + Vite build on the GitHub runner,
the whole release travels as **one zip**, and a token-protected PHP hook unpacks
it and runs your migrations.

**Laravel · GitHub Actions · cPanel / shared hosting · FTP or FTPS · MIT.**

> বাংলায় সেটআপ গাইড: [`SECRETS.md`](./SECRETS.md) — কোন তথ্য কোথায় বসাতে হবে, ধাপে ধাপে।

---

## 🧭 Is this the right kit?

| Your hosting | Use |
|---|---|
| cPanel / shared hosting · **no SSH**, or SSH blocked by the host firewall | **this kit** |
| VPS with SSH (CloudPanel, Plesk, DigitalOcean, Hetzner…) | [`../github-actions-laravel-deploy-kit/`](../github-actions-laravel-deploy-kit/) — rsync-based, adds test gating, DB backup before migrate, FPM reload and queue restart |

If you have SSH, use the other kit — it can do more. This kit exists for the
case the other one cannot reach: **many cPanel hosts firewall SSH entirely**, and
FTP is the only door in.

---

## Why this exists

Deploying a *built* Laravel app over FTP the obvious way means uploading ~25,000
files one at a time — `vendor/` alone is ~15,000. FTP opens a new data connection
per file, so latency, not bandwidth, decides: the first deploy takes **30–50
minutes** and often times out halfway, leaving a half-broken site.

The fix is not a faster FTP action. It is to stop sending 25,000 files:

> build on the runner → **zip the release into a single file** → upload that one
> file → let a small token-protected PHP hook unpack it and run artisan.

Same result, **~40× faster**, on hosting where SSH does not exist.

Everything else here is a scar: the storage skeleton that zip archives cannot
carry, the `--resolve` trick for reaching a server whose DNS is not ready yet,
the CLI-PHP-binary hunt for hosts whose `php` is secretly 5.x, the
`opcache_reset()` that stops "I deployed but nothing changed". Each one is
documented next to the code that fixes it.

## Two ways to use it

### 🤖 Hand it to your AI agent

Point your agent at this folder (or paste [`RECIPE.md`](./RECIPE.md)):

> "Set up GitHub Actions auto-deploy for my Laravel project on cPanel using this
> kit. Follow RECIPE.md, then tell me exactly which GitHub secrets and variables
> to create."

The agent copies the workflow, adapts the project, and hands you a fill-in-the-
blank list. It **cannot** create the secrets for you — that part is
[`SECRETS.md`](./SECRETS.md) and takes about ten minutes.

### 🧑‍💻 By hand

1. Copy `workflows/deploy.yml` into `.github/workflows/deploy.yml`.
2. Create the secrets and variables from [`SECRETS.md`](./SECRETS.md).
3. Push to `main`.

## What's in the box

```
RECIPE.md                          ← implementation guide for humans + AI agents
SECRETS.md                         ← বাংলা: which secret/variable, where to get it
TROUBLESHOOTING.md                 ← symptom → cause → fix, indexed by error string
LICENSE                            ← MIT
workflows/
└── deploy.yml                        the whole pipeline — one self-contained file
server/
├── deploy-hook.php                   readable mirror of the hook the workflow generates
├── root.htaccess                     root → public/ rewrite + hardening
└── public.htaccess                   Laravel front controller + cache headers
templates/
└── env.production.template           what the generated production .env looks like
```

Only `workflows/deploy.yml` (and usually `server/root.htaccess`) is copied into
your project. The rest is reference — the workflow generates the hook itself.

## What a deploy actually does

```
 developer            GitHub Actions runner                    cPanel server
 ──────────           ─────────────────────                    ─────────────
 git push  ──────►    validate secrets (fail fast)
   (main)             composer install --no-dev
                      npm ci && npm run build
                      write .env  ← Secrets/Variables
                      stamp deploy-version.txt
                      generate public/deploy-hook.php
                      zip EVERYTHING into one file
                      upload  ──────────────────────────►   deploy.zip
                                                            deploy-hook.php
                      GET ?action=unzip  ────────────────►  extractTo(root)
                                                            + storage skeleton
                                                            + opcache_reset()
                      GET ?action=artisan  ──────────────►  migrate --force
                                                            storage:link
                                                            config/event/view:cache
                      GET the homepage, fail if ≥ 400
```

## Live health check

```
https://yoursite.com/deploy-hook.php?token=YOUR_DEPLOY_SECRET&action=health
```

Returns PHP version, whether `zip`/`exec`/`symlink` are available, which folders
are writable, and **which commit is currently live** — the fastest way to answer
"did my push actually deploy?".

## Safety properties

- `storage/` is never shipped → uploaded files and logs survive every deploy
- Only the **sha256** of `DEPLOY_SECRET` ever reaches the server
- `migrate --force` only — never `migrate:fresh` / `migrate:refresh`
- Overlapping deploys are queued, never interleaved or cancelled mid-migration
- `.env` is generated per deploy from secrets; it is never in the repo
- The root `.htaccess` keeps `/.env` and `/deploy.zip` unreachable
- The run goes red unless the homepage actually answers

## License

MIT. Free for anyone — students, freelancers, commercial projects.

# 🚀 GitHub Actions Auto-Deploy — Laravel + Vite → VPS

Push to `master`. Two minutes later it is live — tested, built, migrated behind
a fresh database backup, with every cache busted. No SSH by hand, no
"why is the old CSS still showing", no deploy that half-finished.

**GitHub Actions · Laravel 10/11/12 · Vite · any Linux VPS · MIT.**

---

## Why this exists

Most Laravel deploy workflows you find are six lines of `rsync` and a hope. They
work on a good day. This one is what six lines turns into after a year of real
failures:

- a deploy that **cannot** ship a commit whose tests are red;
- a **gzipped database dump taken immediately before every migration**;
- **build on the runner, never on the server** — production needs no Node, no
  build toolchain, and never spikes memory during a deploy;
- **every SSH step retried** — a public port 22 refuses roughly a quarter of
  connections to background scanning alone, which was failing ~60% of deploys;
- **all seven cache layers cleared**, including the one everyone forgets (HTML
  naming your hashed assets);
- an **rsync exclude list** written so `--delete` can never eat user uploads.

Every gotcha in [`RECIPE.md`](./RECIPE.md) was paid for in production.

## Two ways to use it

### 🤖 Hand it to your AI agent

Point your agent at this folder (or paste [`RECIPE.md`](./RECIPE.md)):

> "Set up auto-deploy for my Laravel project using this kit. Follow RECIPE.md,
> wire it to my app, and tell me exactly which GitHub secrets to create."

The agent copies the files, adapts the seams (PHP/Node version, branch, rsync
excludes), and hands you the secrets list. It **cannot** create the secrets —
that part is [`SECRETS.md`](./SECRETS.md), and it takes about ten minutes.

### 🧑‍💻 Do it by hand

[`RECIPE.md`](./RECIPE.md) §3–§4 for the files, [`SECRETS.md`](./SECRETS.md)
for the GitHub side, [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) when
something goes red.

## The pipeline

```
git push  →  test  →  build (composer --no-dev + npm run build)
                   →  rsync --delete (server-owned paths excluded)
                   →  on the server:  backup → migrate → clear+rebuild caches
                                      → reload FPM → restart queue
                   →  purge Cloudflare (optional)
                   →  live
```

Red tests stop everything. Two deploys never run at once. Every step is
idempotent, which is what makes retrying them safe.

## What's in the box

```
RECIPE.md               ← the implementation guide (humans + AI). Start here.
                          §0 discovery · §0b server preflight · §4b queue workers
SECRETS.md              ← every GitHub secret, and exactly where to get its value
                          + SSH key, web root, upload limits, FPM sudo, sshd
TROUBLESHOOTING.md      ← real error messages → the fix that worked
LICENSE                 ← MIT

github/
├── workflows/deploy.yml     the pipeline
└── scripts/
    ├── post-deploy.sh       runs ON the server: backup → migrate → caches
    └── with-retry.sh        6 attempts + backoff around every SSH step

laravel/
├── Http/Middleware/FreshHtml.php    a deploy is visible on the NEXT page load
├── Support/BuildVersion.php         fingerprint of the deployed frontend build
├── tests/DeployFreshnessTest.php    proves the above still works
└── bootstrap-app.example.php        the two lines to merge into bootstrap/app.php

server/
├── fix-ssh-connection-drops.sh      raises sshd's pre-auth queue ~40× (run once)
└── setup-cron.sh                    installs the scheduler crontab line

frontend-react/          optional — "a new version is available" for long-open SPA tabs
optional-housekeeping/   optional — maintenance that runs even with no cron
```

## Quick start

```bash
# 1. copy the files (see RECIPE.md §3 for the full mapping)
cp -r github/workflows github/scripts   your-project/.github/
cp laravel/Http/Middleware/FreshHtml.php your-project/app/Http/Middleware/
cp laravel/Support/BuildVersion.php      your-project/app/Support/

# 2. the executable bit is tracked by git and the workflow needs it
cd your-project
git update-index --chmod=+x .github/scripts/post-deploy.sh .github/scripts/with-retry.sh

# 3. register FreshHtml in bootstrap/app.php  (see laravel/bootstrap-app.example.php)
# 4. create the 7 GitHub secrets              (see SECRETS.md)
# 5. push
```

## The seven secrets

`SERVER_IP` · `SERVER_USERNAME` · `SERVER_SSH_KEY` · `PROJECT_PATH` ·
`DB_DATABASE` · `DB_USERNAME` · `DB_PASSWORD`

Optional: `CLOUDFLARE_ZONE_ID` · `CLOUDFLARE_API_TOKEN` (purge is skipped
silently without them).

Full instructions — how to generate the SSH key, where each value lives, and
the mistakes that catch everyone — in [`SECRETS.md`](./SECRETS.md).

## Requirements

| | |
|---|---|
| **Repo** | Laravel 10/11/12 + Vite; `composer.lock`, `package-lock.json` and `.env.example` committed |
| **Server** | Any Linux VPS with SSH + PHP-FPM + MySQL. CloudPanel, Plesk, plain nginx — all fine. **No Node required.** |
| **CI** | GitHub Actions (free tier is plenty) |

Postgres, or not Laravel at all? [`RECIPE.md`](./RECIPE.md) §7 lists exactly
what to swap; the structure is unchanged.

## Safety

- `deploy` **needs** `test` — a red suite ships nothing.
- A gzipped `mysqldump` is taken **before** every migration; the last 10 are kept.
- `migrate --force` only. Never `migrate:fresh`, never `db:wipe`, never `--seed`.
- Secrets reach the server **on stdin**, never as arguments — `DB_PASSWORD`
  never appears in the process list.
- `concurrency: production-deploy` — two deploys can never interleave.

## License

MIT — use it anywhere, including commercial projects.

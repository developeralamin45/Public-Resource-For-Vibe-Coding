# RECIPE — GitHub Actions auto-deploy for Laravel + Vite

> **For the AI agent implementing this in another project.** Read it all before
> you touch a file. Push to `master` → tested, built, rsynced, migrated behind a
> backup, every cache busted, CDN purged. No SSH by hand, ever again.
>
> Every design decision below was paid for by a production failure. The
> **GOTCHAS** in §10 are the ones that cost the most — do not optimise them away.

---

## 1. What you are building

```
   git push origin master
        │
        ▼
 ┌──────────────┐   composer install  →  php artisan test
 │   job: test  │   (sqlite in-memory, no server involved)
 └──────┬───────┘   ✗ red  →  STOP. Nothing reaches production.
        │ ✓
        ▼
 ┌──────────────┐   composer install --no-dev --optimize-autoloader
 │  job: deploy │   npm ci && npm run build          ← built ON THE RUNNER
 │              │
 │   build      │   ── everything above builds a release ──────────
 │    ↓         │
 │   ship       │   ssh-keyscan     ⟳ retry
 │              │   rsync -az --delete (excludes server-owned dirs)  ⟳ retry
 │              │   ssh 'bash -s' < post-deploy.sh  ⟳ retry
 │              │        │  mysqldump → storage/app/backups/*.sql.gz
 │              │        │  php artisan migrate --force     (additive only)
 │              │        │  optimize:clear → cache:clear → re-cache
 │              │        │  reload php-fpm  (OPcache)
 │              │        └─ queue:restart
 │              │   Cloudflare purge   (skipped if no secrets)
 └──────────────┘
        ▼
     it is live
```

**Two properties hold this together, and nothing works without them:**

1. **The runner builds; the server only receives.** `composer`, `node` and
   `npm` never run on production. The box needs PHP + MySQL and nothing else —
   no Node, no build toolchain, no memory spike during a deploy, and a broken
   `npm install` can never take the site down.
2. **Every step is idempotent, so every step can be retried.** `rsync`
   converges on the same tree; `migrate` re-runs applied migrations as no-ops;
   the cache steps just rebuild. That is what makes §10's retry wrapper safe.

## 2. Requirements

| Side | Needs |
|---|---|
| Repo | Laravel 10/11/12, Vite, `composer.lock` + `package-lock.json` committed, `.env.example` committed |
| Server | Any Linux VPS with SSH, PHP-FPM, MySQL. CloudPanel / Plesk / plain nginx all fine. **No Node needed.** |
| GitHub | Seven repository secrets — [`SECRETS.md`](./SECRETS.md) |

Not Laravel? The workflow shape still applies; §7 lists what to swap.

## 3. Files — where each one goes

```
github/workflows/deploy.yml      → .github/workflows/deploy.yml
github/scripts/post-deploy.sh    → .github/scripts/post-deploy.sh   (chmod +x)
github/scripts/with-retry.sh     → .github/scripts/with-retry.sh    (chmod +x)

laravel/Http/Middleware/FreshHtml.php → app/Http/Middleware/
laravel/Support/BuildVersion.php      → app/Support/
laravel/tests/DeployFreshnessTest.php → tests/Feature/
laravel/bootstrap-app.example.php     → MERGE into bootstrap/app.php (do not overwrite)

server/fix-ssh-connection-drops.sh → scripts/server/   (run on the server, once)
server/setup-cron.sh               → scripts/          (run on the server, once)

frontend-react/*                   → optional; SPA "new version available" banner
optional-housekeeping/*            → optional; see its own README
```

The executable bit matters. Git tracks it, and the workflow calls these scripts
directly:

```bash
git update-index --chmod=+x .github/scripts/post-deploy.sh .github/scripts/with-retry.sh
```

## 4. Install — do these in order

1. **Copy the files** per §3.
2. **Merge `bootstrap/app.php`** — append `FreshHtml::class` to the `web` group.
   On Laravel ≤10 add it to `$middlewareGroups['web']` in `app/Http/Kernel.php`.
3. **Tune `deploy.yml`** (§5) — PHP version, Node version, branch name.
4. **Check `.env.example` is committed and current.** The first deploy builds
   the server's `.env` from it. Every key the app needs must be present, even
   empty. This is the single most common first-deploy failure.
5. **Confirm the test job can pass offline.** It runs with no database server,
   so `phpunit.xml` must use sqlite:
   ```xml
   <env name="DB_CONNECTION" value="sqlite"/>
   <env name="DB_DATABASE" value=":memory:"/>
   ```
   If the suite genuinely needs MySQL, add a `services: mysql:8` block to the
   test job rather than deleting the job. **Never delete the test job** — it is
   the only thing standing between a broken commit and production.
6. **Tell the human to do [`SECRETS.md`](./SECRETS.md).** You cannot do this
   part. Give them the seven names and stop; do not invent placeholder values,
   and never write a real secret into a file.
7. **Push.** Watch the Actions tab.

## 5. The seams — what changes per project

| Seam | Where | Note |
|---|---|---|
| PHP version + extensions | `deploy.yml`, both jobs | Match `composer.json`'s `php` constraint **and the server's PHP**. Mismatch here is a runtime error nothing catches. |
| Node version | `deploy.yml` deploy job | Match `package.json` `engines`, else your local build. |
| Production branch | `deploy.yml` `on.push.branches` | |
| Build command | `npm run build` | Change if your script is named differently. |
| rsync excludes | `deploy.yml` | See §6 — get this wrong and you delete user uploads. |
| Backup command | `post-deploy.sh` | `mysqldump` → `pg_dump` for Postgres. |
| Post-migration hooks | `post-deploy.sh` | Add app-specific warmups after `migrate`, before the cache rebuild. |
| Test route | `DeployFreshnessTest::HTML_ROUTE` | Any always-200 HTML route. |

## 6. The rsync exclude list — read this before you edit it

`rsync --delete` makes the server's directory **identical** to the release.
Anything not in the release and not excluded is **deleted**. The shipped list:

| Excluded | Why |
|---|---|
| `.env` | The server owns its own. Ship it and you overwrite production credentials with example ones. |
| `storage/app/` | User uploads. **Deleting this is unrecoverable.** |
| `storage/framework/`, `storage/logs/` | Sessions, compiled views, logs — runtime state. |
| `public/storage` | The symlink `storage:link` creates. |
| `public/hot` | Vite dev-server marker. If it survives onto production, every asset URL points at `localhost`. |
| `bootstrap/cache/*.php` | Rebuilt by `config:cache` seconds later. |
| `.git/`, `.github/`, `node_modules/`, `tests/` | Not needed to serve the app. |

**Add an exclude for every writable path your app owns** — invoices, generated
PDFs, certificates, a sitemap written at runtime, anything outside
`storage/app/`. Adding one is free; forgetting one is a restore-from-backup.

`public/build/` is deliberately **not** excluded: that is the new frontend, and
`--delete` is what removes the old chunks.

## 7. Non-Laravel / non-MySQL ports

The workflow structure is framework-agnostic. Keep: retry wrapper, backup
before migrate, build on the runner, `--delete` rsync with an exclude list,
cache-bust everything. Swap:

- `composer install` → your dependency install
- `php artisan migrate --force` → your migration runner (**must be additive
  only — never `migrate:fresh`, never `db:wipe`, never `--seed` in production**)
- `optimize:clear` + `*:cache` → your framework's cache commands
- `mysqldump` → `pg_dump` / `sqlite3 .backup` / your provider's snapshot API

## 8. Cache busting — the seven layers

The step most deploys get wrong. Miss any one layer and somebody, somewhere,
still sees yesterday's site — usually the client, on the call.

| Layer | Who holds it | Cleared by |
|---|---|---|
| Compiled config / routes / views / events | Laravel, `bootstrap/cache` | `optimize:clear`, then re-cached |
| Application cache (settings, build id) | `CACHE_STORE` | `cache:clear` — sessions live in the DB, so nobody is logged out |
| Compiled PHP bytecode | OPcache, in FPM worker memory | PHP-FPM pool reload (falls back to `validate_timestamps`) |
| Old JS/CSS in browsers | the visitor | Vite content-hashes filenames — a new build simply has a new name |
| **Stale HTML pointing at old filenames** | the visitor, any proxy | **`FreshHtml` middleware** |
| CDN edge copies | Cloudflare | purge step (skipped without the secrets) |
| Long-open SPA tabs on old JS | the tab | `BuildVersion` + `useBuildChanged` → offer a refresh |

**`FreshHtml` is the one people skip, and it is the one that bites.** Hashed
assets are useless if the HTML naming them is cached: the browser keeps asking
for yesterday's filenames long after the deploy. `no-cache` does not mean
"download every time" — it means "ask first". Paired with an ETag, an unchanged
page costs a 304 with an empty body, so pages stay fast on a slow mobile
connection **and** update the moment you deploy.

Sessions must live in the database or Redis (`SESSION_DRIVER=database`), not in
`storage/framework/sessions` — `cache:clear` is safe either way, but file
sessions plus `--delete` is a logout for everyone.

## 9. Safety — what protects the data

| Risk | Guard |
|---|---|
| A bad commit reaching production | `deploy` needs `test`; red tests → nothing ships |
| A migration destroying data | gzipped `mysqldump` immediately before `migrate`; 10 kept, rotated |
| Two deploys colliding | `concurrency: production-deploy`, `cancel-in-progress: false` |
| A destructive migration | `migrate --force` only. Never `fresh`, never `wipe`, never `--seed` |
| Credentials in the process list | the payload goes over **stdin**, not argv |
| A half-shipped release | idempotent steps + retry, so a dropped connection resumes instead of failing |
| Losing uploads | rsync exclude list (§6) |

Backups land in `storage/app/backups/pre-deploy-YYYYMMDD-HHMMSS.sql.gz` on the
server. Restore:

```bash
gunzip < storage/app/backups/pre-deploy-20260827-101500.sql.gz | mysql -u USER -p DB
```

Ten deploys' worth is a safety net, not a backup policy. Tell the human to copy
these off-box (S3, Spaces, `rclone` cron) — a server that loses its disk loses
the backups with it.

## 10. GOTCHAS — every one of these was a production failure

**Deploys failing ~60% of the time with `kex_exchange_identification:
Connection reset by peer`.** It reads like a network fault. It is not. Port 22
is public and permanently scanned; every bot that connects holds a pre-auth
slot until `LoginGraceTime` (stock: 120s) expires, and stock `MaxStartups
10:30:100` is only ten slots. Measured on a real box: **8 of 30 strictly
sequential connections refused — 26%**. A deploy opens three connections, so
`0.74³ ≈ 40%` of deploys survived. Worst case: rsync succeeds and post-deploy
dies, leaving new code behind stale caches. Fixed in two independent halves,
either sufficient alone — `server/fix-ssh-connection-drops.sh` (≈40× the
pre-auth capacity) and `with-retry.sh` (6 attempts, exponential backoff).
**Keep the retry wrapper even after the server is fixed.** A dropped TCP
connection is never a reason to fail a deploy.

**`appleboy/ssh-action` has no retry of its own**, and it was the step that
failed most — always *after* rsync had shipped. Replaced with a plain `ssh`
call, which can go through the retry wrapper and drops a third-party action
from the release path.

**`RETRY_STDIN` must be a file, not a pipe.** A pipe is drained by the first
attempt, so every retry sends an empty script — a deploy that goes green having
done nothing.

**Secrets on stdin, never argv.** `ssh host "DB_PASSWORD=x ./script"` puts the
password in the server's process list for anyone running `ps`.

**`if:` cannot read `secrets` at step level.** That is why the Cloudflare
secrets are mapped to job-level `env:` first. Move them back inline and the
purge step silently never runs.

**PHP version must match the server**, not just `composer.json`. Building
against 8.3 and serving on 8.2 fails at runtime, and no CI step catches it.

**`storage/app/` in the rsync list would delete every upload.** `--delete` is
literal.

**`public/hot` shipped to production** points every asset URL at `localhost`.
Excluded for that reason.

**`chmod +x` on the scripts.** Without it the workflow dies at the first
`.github/scripts/…` call with "Permission denied".

**OPcache sudo fails silently.** Wrong username or wrong unit name → sudo
declines, the deploy still goes green, and PHP serves yesterday's bytecode. The
unit is discovered at runtime, so the sudoers rule must match whatever
`systemctl list-units | grep fpm` prints — often `php-fpm.service`, not
`php8.2-fpm.service`. Grep the deploy log for `no sudo?`.

**`.env.example` must be committed and complete.** First deploy builds the
server's `.env` from it. A missing key means a `500` at first boot with no
obvious cause.

**Never `migrate:fresh`, `db:wipe`, or `--seed` in a deploy.** One of those in a
pipeline that runs on every push is how a live database gets erased. Migrations
must be additive: add a column, backfill, deploy, then drop the old one in a
*later* release — never rename in one step while old code is still serving.

## 11. Verify after implementing

1. Push a trivial change → Actions goes green end to end.
2. The change is visible **on the first page load**, no hard refresh. (If not:
   `FreshHtml` is not registered.)
3. `curl -sI https://yoursite/ | grep -i 'cache-control\|etag'` → `no-cache` + an ETag.
4. On the server: `ls -la storage/app/backups/` → a fresh `.sql.gz`.
5. On the server: `ls -la storage/app/` → uploads still there.
6. Deploy log has no `no sudo?` line (or the human has accepted that trade).
7. Break a test on a branch, merge it → the deploy job never runs.
8. Deploy twice in a row with no changes → both green. (Idempotency.)
9. `php artisan about` on the server → correct env, `APP_DEBUG=false`.
10. `php artisan migrate:status` → nothing pending.

## 12. Rollback

```bash
git revert <bad-commit> && git push        # preferred: ships a fix through the same tested path
```

Database too far gone? Restore the pre-deploy dump (§9), then revert. Buy time
first with `php artisan down`, and remember `up` afterwards.

Reverting is better than `git reset --force`: the pipeline is the only path to
production that is tested, backed up, and cache-cleared. Do not hand-edit files
on the server — the next deploy's `rsync --delete` erases them without a word.

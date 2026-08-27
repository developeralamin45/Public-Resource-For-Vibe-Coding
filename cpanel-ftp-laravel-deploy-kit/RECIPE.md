# RECIPE — GitHub Actions auto-deploy for Laravel on cPanel (no SSH)

> **For the AI agent implementing this in another project.** This kit is a
> complete, battle-tested push-to-deploy pipeline: the developer pushes to
> `main`, and 2–4 minutes later the built app is live, migrated and cached.
> Every decision below has a reason recorded next to it — **do not "simplify"
> the architecture**, each piece exists because the obvious approach failed in
> production first.

---

## 1. What it does

```
 developer            GitHub Actions runner                    live server
 ──────────           ─────────────────────                    ───────────
 git push  ──────►    1. composer install --no-dev
   (main)             2. npm ci && npm run build
                      3. write .env  ← Secrets/Variables
                      4. stamp deploy-version.txt
                      5. generate public/deploy-hook.php
                      6. zip EVERYTHING into one file
                      7. upload  ────────────────────────►  deploy.zip
                                                            deploy-hook.php
                      8. GET ?action=unzip  ─────────────►  extractTo(root)
                                                            + storage skeleton
                                                            + opcache_reset()
                      9. GET ?action=artisan  ───────────►  migrate --force
                                                            storage:link
                                                            config/event/view:cache
                     10. GET the homepage, assert < 400
```

**The single most important design decision:** the whole release travels as
**one zip file**, not as 25,000 individual FTP transfers. That is the difference
between a 2-minute deploy and a 40-minute one. Everything else follows from it.

### ⚠️ First: is this the right kit?

**If the user has working SSH to the server, stop and use
[`../github-actions-laravel-deploy-kit/`](../github-actions-laravel-deploy-kit/)
instead.** That kit rsyncs over SSH and additionally gates on tests, takes a
database backup before migrating, reloads FPM and restarts queue workers — all
things you simply cannot do without a shell.

This kit is for the case that one cannot reach: **cPanel / shared hosting where
SSH does not exist or is blocked by the host firewall**, leaving FTP as the only
way in. Everything artisan-related then has to happen through a token-protected
PHP endpoint, which is what `deploy-hook.php` is.

---

## 2. Before you write anything — ask the user these

Do not guess. Ask, in one message, and wait:

1. **Do you have SSH access to the server?** If yes → switch to the SSH kit
   (see above) and do not use this one. Ask them to actually try
   `ssh user@host` — many people assume they have it because cPanel shows a
   "Terminal" icon, and many hosts firewall port 22 from outside.
2. **Live domain?** (e.g. `https://example.com`) → becomes `APP_URL`.
3. **The FTP path that contains `artisan` and `public/`?** → `FTP_SERVER_DIR`
   (must end with `/`). This is the single most common thing to get wrong.
4. **Does the domain's document root point at the project root, or at `public/`?**
   → sets `UPLOAD_ROOT_HTACCESS`.
5. **Server PHP version?** (cPanel → Select PHP Version) → `PHP_VERSION`.
6. **Deploy branch?** (default `main`.)

If they do not know 3 or 4, tell them how to find out: log in with FileZilla or
cPanel File Manager and locate the folder containing `artisan`.

---

## 3. Files to copy

```
workflows/deploy.yml   →  .github/workflows/deploy.yml

server/root.htaccess   →  .htaccess          (project root — only when the
                                              document root IS the project root;
                                              skip it if it already points at
                                              public/, and set
                                              UPLOAD_ROOT_HTACCESS=false)
server/public.htaccess →  public/.htaccess   (only if missing or broken)
```

`server/deploy-hook.php` and `templates/env.production.template` are **reference
copies** — do NOT add them to the project. The workflow generates both.

Copy the workflow **verbatim**. It is parameterised entirely through GitHub
Secrets and Variables; there is normally nothing to edit inside it.

---

## 4. Adapt the project itself

Work through these — most projects need 2 or 3 of them:

| Check | What to do |
|---|---|
| `.env` committed? | It must not be. Add `.env` to `.gitignore`; if it is in history, tell the user their credentials are compromised and must be rotated |
| Build script | The workflow runs `npm run build`. If `package.json` has no `build` script (a Blade-only app with no Vite), delete the *Setup Node* and *Build frontend* steps |
| Frontend build output | Laravel + Vite writes `public/build` — already shipped. Laravel Mix writes `public/css`, `public/js` — also shipped. Nothing to change |
| Seeder | If the user wants the first deploy to create an admin, make `DatabaseSeeder` **idempotent** (`updateOrCreate`, never `create()`), take the credentials from `env('ADMIN_EMAIL')` / `env('ADMIN_PASSWORD')`, and set `RUN_SEEDER=true` |
| Closure routes | `grep -n "function ()" routes/*.php`. Any closure route means `route:cache` will fail → leave `ROUTE_CACHE=false` (the default) |
| Queue workers / scheduler | Not covered by this kit. On shared hosting set up a cron for `schedule:run`; mention it, do not silently skip it |
| Extra `.env` keys | Anything the app needs beyond the standard block (mail, payment, SMS keys) goes in the `EXTRA_ENV` secret — do **not** add lines to the workflow YAML |
| PHP extensions | If `composer.json` requires `ext-*` beyond the defaults, add them to the `extensions:` list in the *Setup PHP* step |

---

## 5. Hand the user their instructions

The user cannot see GitHub Secrets from your side — **you must give them an
exact, fill-in-the-blank list**. Read `SECRETS.md` and produce a message like
the one below, with the values you already know filled in:

> **Go to:** your repo → **Settings** → **Secrets and variables** → **Actions**
>
> **Tab "Secrets" → New repository secret** (8 of them):
>
> | Name | Value |
> |---|---|
> | `APP_KEY` | run `php artisan key:generate --show` locally and paste the whole `base64:…` |
> | `FTP_HOST` | your cPanel server IP (cPanel home page → "Shared IP Address") |
> | `FTP_USERNAME` | your cPanel/FTP username |
> | `FTP_PASSWORD` | that account's password |
> | `DB_DATABASE` | full DB name **with the cPanel prefix**, e.g. `myuser_appdb` |
> | `DB_USERNAME` | full DB user name, e.g. `myuser_appuser` (must have ALL PRIVILEGES) |
> | `DB_PASSWORD` | that DB user's password |
> | `DEPLOY_SECRET` | any long random text — generate with `openssl rand -hex 24` |
>
> **Tab "Variables" → New repository variable:**
>
> | Name | Value |
> |---|---|
> | `APP_URL` | `https://example.com` |
> | `FTP_SERVER_DIR` | `/example.com/` ← must end with `/` |
> | `APP_NAME` | `Example App` |
> | `PHP_VERSION` | `8.2` |
>
> Then push to `main` (or Actions → Deploy → **Run workflow**).

Also tell them the **pre-flight checklist**: database + DB user created and
linked with ALL PRIVILEGES, server PHP version matching, and the `zip`, `gd`,
`intl`, `pdo_mysql`, `mbstring`, `fileinfo` extensions enabled.

---

## 6. GOTCHAS — every one of these is a bug that already bit somebody

Keep them. They look like details; they are the kit.

1. **Build `vendor/` on the runner, ship it in the zip.** Do not exclude
   `vendor/` and run `composer install` on the server: shared hosts cap CLI
   memory below what a Laravel install needs, ship stale composer binaries, and
   often block packagist. Building on the runner also makes every deploy
   byte-identical.
2. **`deploy-hook.php` must live in `public/`.** It is the only web-reachable
   directory, and `dirname(__DIR__)` then correctly resolves to the project root.
   Putting it in the project root means it is either unreachable or, worse,
   reachable *and* sitting next to `.env`.
3. **The root `.htaccess` must be uploaded in the same run as the zip.** Without
   the root → `public/` rewrite, `/deploy-hook.php` 404s and the very first
   deploy can never unpack itself. Chicken-and-egg: the hook is uploaded
   separately *as well as* inside the zip, precisely so the first unzip has
   something to run.
4. **Reach the hook by IP with the domain forced, then fall back to DNS.**
   `curl --resolve domain:443:IP` keeps SNI and certificate validation correct
   while bypassing DNS — essential while a domain is still propagating or when
   the runner resolves it to an old host. A plain `Host:`-header HTTP call is
   the second fallback, public DNS the third.
5. **Sanitise secrets before putting them in a URL.** A pasted `FTP_HOST` with a
   trailing newline or an `https://` prefix produces `curl: (3) URL rejected`
   and the deploy dies at the last step. Strip whitespace and scheme; pass the
   token with `--data-urlencode`, never string concatenation.
6. **Never let `curl` failure kill the step silently.** Each attempt is guarded
   and the response body is printed. A deploy that "passed" while the site is
   down is the worst outcome — hence the final homepage check.
7. **Recreate `storage/` and `bootstrap/cache` after every unzip.** Zip archives
   do not store empty directories, so `storage/framework/views` vanishes and
   Laravel dies with *"Please provide a valid cache path"*.
8. **Do NOT ship `storage/` at all.** Excluding it is what protects uploaded
   user files and logs. Both `extractTo()` and `tar -xzf` are additive, so
   anything you do ship silently overwrites the server's copy.
9. **Do NOT ship `bootstrap/cache/*`.** Caches built on the runner reference the
   runner's absolute paths.
10. **Clear caches with `config:clear`/`route:clear`/`view:clear`, not
    `optimize:clear`.** `optimize:clear` also runs `cache:clear`, which needs the
    `cache` *table* — it does not exist on a first deploy, so the very first
    command of the very first deploy fails.
11. **`route:cache` is off by default.** It throws on closure routes. Turn it on
    only after every closure has moved into a controller.
12. **Prefer running artisan in-process over `exec()`.** Booting Laravel's
    console kernel inside the request is immune to `disable_functions` *and*
    guarantees the right PHP version. `exec()` is the fallback, and it hunts for
    the real CLI binary (`/opt/cpanel/ea-php82/root/usr/bin/php` …) because
    plain `php` on a shared host is very often an ancient 5.x stub.
13. **`opcache_reset()` after unzipping.** New files on disk, stale bytecode in
    memory — the "I deployed but nothing changed" bug.
14. **Only the sha256 of `DEPLOY_SECRET` reaches the server.** The plaintext
    token never leaves GitHub; the hook compares hashes with `hash_equals`.
15. **Never enable `dangerous-clean-slate` on the FTP action.** It wipes the
    remote directory — including `storage/app/public`, i.e. every user upload.
16. **`concurrency` without `cancel-in-progress`.** Two overlapping deploys can
    interleave migrations. Queue them; never cancel one mid-flight.
17. **`migrate --force` only.** Never `migrate:fresh` / `migrate:refresh` in a
    deploy — they drop every table.
18. **Quote the `.env` heredoc (`<< 'ENVEOF'`).** GitHub substitutes `${{ }}`
    before bash sees the text, so a quoted heredoc means a secret containing
    `$`, `"` or a backtick still lands verbatim.

---

## 7. Verify after implementing

1. Actions tab shows the workflow; a push to `main` starts it.
2. Build steps pass; the *Package* step prints a zip size in the tens of MB.
3. FTP/SCP upload completes in well under a minute.
4. Unzip step returns `{"status":"unzipped_ok","files":NNNN}`.
5. Artisan step returns `"status":"done"` and `"failed_count":0`.
   `"storage_link": true`.
6. The verify step reports `✅ https://… is up`.
7. Open the site: pages render, CSS/JS load (not 404), an uploaded image loads.
8. `?action=health` shows `deployed` = the commit you just pushed.
9. Push a trivial visible change → it is live within ~3 minutes.
10. **Second deploy is the real test:** it must not duplicate seeded data, must
    not wipe an uploaded file, and must still return `failed_count: 0`.

If any step fails, go to [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) — it is
indexed by the exact error string.

---

## 8. Adapting to other stacks

- **Laravel without Vite/Node** — delete the *Setup Node* + *Build frontend*
  steps. Everything else is unchanged.
- **Laravel 8/9/10** — works as-is. `event:cache` exists from 5.8; drop it if the
  artisan report shows "command not found".
- **Plain PHP / Symfony / CodeIgniter** — the transport half (build → zip →
  upload → unzip hook) is framework-agnostic. Replace the artisan command list in
  the hook config with whatever your framework needs (or an empty array), and
  drop the `storage/` skeleton logic.
- **Node/Next.js on shared hosting** — the zip-and-unzip transport still applies,
  but you need a process manager, which shared hosting rarely provides. Use SSH
  mode and add a `pm2 reload` step.
- **Staging + production** — copy the workflow to `deploy-staging.yml`, change
  the branch trigger, and use GitHub **Environments** so each has its own set of
  secrets.
- **The user later gets SSH** (moves to a VPS, or the host opens port 22) —
  migrate them to
  [`../github-actions-laravel-deploy-kit/`](../github-actions-laravel-deploy-kit/)
  and delete `public/deploy-hook.php` from the server.

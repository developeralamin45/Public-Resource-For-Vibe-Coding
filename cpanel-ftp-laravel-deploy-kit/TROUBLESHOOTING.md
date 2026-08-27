# 🩺 Troubleshooting

প্রতিটা এন্ট্রি: **উপসর্গ → আসল কারণ → সমাধান**।
Every entry below is a failure that actually happened on a real deploy — not a
hypothetical. Start with the health check, then find your symptom.

## 0. Always start here

```
https://yoursite.com/deploy-hook.php?token=YOUR_DEPLOY_SECRET&action=health
```

```jsonc
{
  "status": "hook_alive",
  "php_version": "8.2.27",        // ← matches PHP_VERSION variable?
  "deployed": "a1b2c3d | main | run #42 | 2026-08-27T09:11:04Z",  // ← the commit that is LIVE
  "zip_extension": true,          // ← false = unzip can never work
  "exec_available": false,        // ← false is fine; in-process artisan is used
  "present":  { "vendor": true, "env": true, "build": true },
  "writable": { "storage": true, "bootstrap_cache": true }
}
```

`deployed` is the fastest way to answer *"did my push actually go live?"*.
If it shows an old commit, the deploy never reached the server — look at the
upload/unzip steps, not at your code.

---

## 1. Speed

### The first deploy takes 30–50 minutes (or times out)

**Cause.** Uploading a *built* Laravel app file-by-file over FTP means ~25,000
individual files — `vendor/` alone is ~15,000. FTP opens a new data connection
per file, so latency, not bandwidth, dominates. This is the classic
`FTP-Deploy-Action` first-run experience and it is not fixable by tuning.

**Fix.** That is exactly what this kit removes: everything goes into **one zip**
(a single ~20–40 MB transfer, usually under a minute), and a small PHP hook on
the server unpacks it. Deploys land in 2–4 minutes total, including build.

> Never "fix" this by excluding `vendor/` and running `composer install` on the
> server. It was tried; it is worse. Shared hosts cap CLI memory (composer needs
> ~1.5 GB for a Laravel install), ship old composer binaries, and often block
> outbound HTTPS to packagist. Build on the runner — the result is identical
> every time.

---

## 2. The hook is unreachable

### `deploy-hook.php never answered at https://…`

Try in this order:

1. **`FTP_SERVER_DIR` points at the wrong folder.** By far the most common.
   Log in with FileZilla / cPanel File Manager and find the folder that contains
   `artisan` and `public/`. *That* path (with a trailing `/`) is the value.
   After a failed run, look for a stray `deploy.zip` — wherever it landed is
   where FTP actually put things.
2. **The root `.htaccess` is missing.** With a cPanel-style layout the domain
   points at the project root, so `/deploy-hook.php` only resolves because the
   root `.htaccess` rewrites everything into `public/`. Set
   `UPLOAD_ROOT_HTACCESS=true`, or upload `server/root.htaccess` by hand as
   `.htaccess` in the site root.
3. **The document root already points at `public/`.** Then the root `.htaccess`
   is wrong and can cause a redirect loop — set `UPLOAD_ROOT_HTACCESS=false`.
4. **Cloudflare / a WAF is in front.** Grey-cloud the record during the first
   deploy, or allow `/deploy-hook.php`.

### `403 forbidden` from the hook

The token did not match.

- `DEPLOY_SECRET` was changed in GitHub *after* the last deploy, so the server
  still holds the **old** hash. Push once more — the new deploy rewrites the hook.
- The FTP upload did not overwrite `public/deploy-hook.php` (permissions).
  Delete it via File Manager and re-run.
- The secret contains spaces or `/`. Use only `A-Z a-z 0-9 _ -`.

---

## 3. Unzip failures

| Response | Cause | Fix |
|---|---|---|
| `{"status":"no_zip"}` | `deploy.zip` is not in the project root — FTP put it elsewhere | Fix `FTP_SERVER_DIR` (see §2.1) |
| `{"status":"zip_ext_missing"}` | PHP `zip` extension off for the **web** SAPI | cPanel → Select PHP Version → Extensions → tick `zip` |
| `{"status":"unzip_failed","code":19}` | Truncated/corrupt upload | Re-run the workflow; if it repeats, the FTP connection is dropping — try `FTP_PROTOCOL=ftps` |
| `{"status":"extract_failed"}` | Disk quota full, or a read-only directory | cPanel → Disk Usage; clear old backups/logs |

---

## 4. The site 500s after a successful deploy

**Read the actual error first:**

```bash
# cPanel File Manager → storage/logs/laravel.log → last ~50 lines
# or temporarily set the GitHub Variable APP_DEBUG=true and redeploy
```

⚠️ Set `APP_DEBUG` back to `false` immediately after. Laravel's debug page
prints your DB credentials.

| Log line | Cause | Fix |
|---|---|---|
| `Please provide a valid cache path` | `storage/framework/views` does not exist. Zip archives carry **no empty directories** | The hook recreates the whole skeleton on every deploy — if you see this, your hook is an older version; redeploy |
| `The stream or file storage/logs/laravel.log could not be opened` | `storage/` not writable | `chmod -R 775 storage bootstrap/cache` in File Manager |
| `No application encryption key has been specified` | `APP_KEY` secret empty or missing `base64:` prefix | Re-copy from `php artisan key:generate --show` |
| `SQLSTATE[HY000][1049] Unknown database` | `DB_DATABASE` missing the cPanel prefix | Use the full `cpaneluser_dbname` |
| `SQLSTATE[HY000][1045] Access denied` | DB user not attached to the DB, or wrong prefix | cPanel → MySQL Databases → *Add User To Database* → ALL PRIVILEGES |
| `SQLSTATE[HY000][2002] Connection refused` | Wrong `DB_HOST` | `127.0.0.1` on cPanel; `localhost` on some hosts |
| `Vite manifest not found` | `public/build/` never arrived | The `npm run build` step failed, or `public/build` is excluded somewhere. Check the build step's log |
| `Class "ZipArchive" not found` | app code needs `zip` at runtime | Enable the extension (§3) |

---

## 5. Artisan command failures in the report

The workflow prints a JSON report with every command, its exit code and output.

### `route:cache` fails — "Unable to prepare route … for serialization. Another route was found"

**Cause.** `routes/web.php` contains **closure routes** (`Route::get('/x', fn() => …)`).
Closures cannot be serialised, so `route:cache` refuses.

**Fix.** Leave `ROUTE_CACHE=false` (the default). Route caching only becomes
available once every closure is moved into a controller. `config:cache` and
`view:cache` still give you most of the win.

### `db:seed` created duplicate rows

**Cause.** `RUN_SEEDER=true` runs the seeder on **every** deploy.

**Fix.** Make the seeder idempotent, then it is safe forever:

```php
User::updateOrCreate(
    ['email' => env('ADMIN_EMAIL', 'admin@example.com')],
    ['name' => 'Super Admin', 'password' => Hash::make(env('ADMIN_PASSWORD')), 'role' => 'super_admin']
);
```

Never `User::create()` or `factory()->count(10)->create()` in a seeder that runs
on deploy. And put the admin credentials in `EXTRA_ENV`, never in the source.

### `exec() is disabled … Run the artisan commands from cPanel Terminal`

**Cause.** The host disabled `exec()` **and** Laravel could not be booted
in-process (usually a fatal error during boot — bad `.env`, missing extension).

**Fix.** Hit `?action=health` to find what is missing. If the app genuinely
cannot boot, run the commands from cPanel → Terminal:

```bash
cd ~/yoursite.com
/opt/cpanel/ea-php82/root/usr/bin/php artisan migrate --force
```

> Note the full path. `php` on a shared host's `PATH` is very often an ancient
> PHP 5.x stub — the classic reason `exec('php artisan …')` fails while the
> website itself runs fine on 8.x. The hook auto-detects the right binary and
> reports its guess as `php_cli_guess` in the health output.

### A migration failed halfway

Migrations are **not** transactional on MySQL for DDL. Fix the migration
locally, then:

```bash
# see where it stopped
php artisan migrate:status
# repair the table by hand if needed, then redeploy
```

Never run `migrate:fresh` or `migrate:refresh` on production — they drop every
table. This kit deliberately only ever runs `migrate --force`.

---

## 6. Files and assets

### I deleted a file but it is still on the server

**Cause.** Both `ZipArchive::extractTo()` and `tar -xzf` are **additive** — they
overwrite and add, never delete. This is deliberate: it is also what keeps
uploaded user files safe.

**Fix.** Delete it once by hand (File Manager / `rm` over SSH). Stale
`public/build/*` chunks from old deploys are harmless (Vite's manifest points at
the current ones) but do accumulate — clearing that folder occasionally is fine.

> Do **not** enable `dangerous-clean-slate` on the FTP action to solve this. It
> wipes the server directory, including `storage/app/public` — every user upload.

### Uploaded images 404

Check `storage_link` in the artisan report. If `false`:

- The host disables `symlink()` → check `symlink_allowed` in the health output.
  Workaround: set `FILESYSTEM_DISK=public` and serve through a controller route,
  or ask support to create the symlink.
- `public/storage` exists as a *real directory* from an old manual fix — delete
  it, then redeploy so `storage:link` can create the symlink.

### Uploaded images break with `net::ERR_INVALID_HTTP_RESPONSE`

**Cause.** `zlib.output_compression = On` in PHP. Laravel's `storage/{path}`
route (any `BinaryFileResponse`) sets `Content-Length` for the **uncompressed**
body; PHP then gzips the body, the header no longer matches, and the browser
discards the whole response. Every image on the site breaks at once.

**Fix.** Turn `zlib.output_compression` **Off** and do compression at the web
server level (`mod_deflate` / brotli) instead.

> `curl` will not reveal this — it does not request gzip by default. Reproduce
> with `curl -H "Accept-Encoding: gzip" -I https://site/storage/foo.webp`.

### Old CSS/JS still being served

1. **Opcache.** The hook calls `opcache_reset()` after every unzip, which is
   normally enough. If the host set `opcache.validate_timestamps=0` and the
   reset does not take, restart PHP from cPanel (Select PHP Version → switch
   away and back) or ask support to reload PHP-FPM.
2. **Browser/CDN cache.** Vite filenames are content-hashed, so a hard refresh
   is enough; if Cloudflare is in front, purge the cache.
3. **The deploy never landed.** Check `deployed` in the health output.

---

## 7. FTP transport errors

| Error | Cause | Fix |
|---|---|---|
| `exit code 67` / `530 Login incorrect` | Wrong `FTP_USERNAME`/`FTP_PASSWORD`, or the host requires FTPS | Verify with FileZilla using the exact same values; try `FTP_PROTOCOL=ftps` |
| `ECONNREFUSED` / `ETIMEDOUT` | Host firewall blocks GitHub's runner IPs, or wrong port | Ask support to allow FTP from outside; try `FTP_PORT=21` explicitly |
| `EPSV` / passive-mode failures | Host's passive port range is closed | Ask support to open the passive range |
| Upload hangs then fails at ~30 MB | Server-side transfer timeout | The workflow already sets `timeout: 600000`; also shrink the zip (exclude `tests/`, docs) |
| `curl: (3) URL rejected: Malformed input` | A secret contains a trailing newline, space, or a `http://` prefix | This kit strips those automatically — but re-paste the secret cleanly anyway |

---

## 8. "Should I be using SSH instead?"

If `ssh user@your-host` works from your machine, yes — use
[`../github-actions-laravel-deploy-kit/`](../github-actions-laravel-deploy-kit/)
instead. It rsyncs, gates on tests, backs up the database before migrating, and
restarts queue workers.

Two things trip people up before they conclude SSH is unavailable:

- **cPanel very often runs SSH on port 2222**, not 22. Try `ssh -p 2222 user@host`.
- A **"Terminal" icon in cPanel is not SSH access** — it is a browser shell that
  GitHub cannot reach. Many hosts enable that while firewalling port 22 from
  outside entirely. That is exactly the situation this kit is built for.

## 9. Workflow / GitHub issues

| Symptom | Fix |
|---|---|
| "This workflow has no runs yet" | The file must be at `.github/workflows/<name>.yml` on the **default branch**, and the `on: push: branches:` list must include your branch |
| Two deploys collided | The `concurrency` block queues them. Never remove it — interleaved migrations are far worse than a queued deploy |
| A required secret is empty | Secrets are **per repository**. A fork, or a repo transferred to an org, does not carry them over |
| Build fails: `requires ext-…` | Add the extension to the `extensions:` list in the *Setup PHP* step |
| Build fails on `tsc` | `npm run build` runs the type-checker in many Laravel + React setups. Fix the type errors, or change your `build` script |
| Need to roll back | Actions → Deploy → pick the last good run → **Re-run all jobs**. It rebuilds that commit and redeploys. (Note: migrations are not rolled back.) |

---

## 10. Security checklist

- [ ] `.env` is in `.gitignore` and was never committed (`git log --all -- .env` must be empty)
- [ ] `APP_DEBUG=false` in production
- [ ] `DEPLOY_SECRET` is long and random (`openssl rand -hex 24`)
- [ ] Root `.htaccess` is in place — it is what makes `/.env` and `/deploy.zip` unreachable
- [ ] `RUN_SEEDER` is off, or the seeder is idempotent and its password comes from `EXTRA_ENV`
- [ ] Admin credentials are **not** hard-coded in `DatabaseSeeder.php`
- [ ] If the repo is public: no credentials anywhere in the workflow YAML — only `${{ secrets.* }}`

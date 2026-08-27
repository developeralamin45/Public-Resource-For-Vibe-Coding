# TROUBLESHOOTING

Every entry below is a failure that actually happened, with the fix that
actually worked. Find your error message.

---

## The deploy never starts

**No workflow run appears after a push.**
The branch does not match. `deploy.yml` listens on `master` and `main`; check
what you actually pushed with `git branch --show-current`. Also confirm the
file is at `.github/workflows/deploy.yml` — any other path is ignored, silently.

**"Workflows aren't being run on this repository"**
Repository → Settings → Actions → General → allow actions.

---

## The `test` job fails

**`could not find driver` / `Database file at path […] does not exist`**
The runner has no MySQL. Point the test suite at in-memory sqlite:

```xml
<!-- phpunit.xml -->
<env name="DB_CONNECTION" value="sqlite"/>
<env name="DB_DATABASE" value=":memory:"/>
```

Ensure `pdo_sqlite, sqlite3` are in the test job's `extensions:` list (they are,
by default). If the suite genuinely requires MySQL, add a `services: mysql:8`
block — do **not** delete the test job.

**`No application encryption key has been specified`**
The `Prepare test environment` step copies `.env.example` and runs
`key:generate`. If you removed it, put it back. If `.env.example` is missing
from the repo, that is the real bug — commit it.

**Tests pass locally, fail on the runner**
Almost always a PHP version difference. Match `php-version:` to what you run
locally *and* to what the server runs.

---

## The `deploy` job fails on SSH

**`kex_exchange_identification: Connection reset by peer`**
**`ssh: handshake failed: … connection reset by peer`**
**`Exceeded MaxStartups`**

Not a network fault. sshd's pre-auth queue is full because port 22 is public
and permanently scanned — every bot holds a slot until `LoginGraceTime`
expires, and stock `MaxStartups 10:30:100` is only ten slots. Measured on a
real box: 8 of 30 strictly sequential connections refused.

Measure yours:

```bash
for i in $(seq 1 30); do
  nc -G 8 -w 8 YOUR_SERVER_IP 22 </dev/null 2>&1 | head -1 | grep -q ^SSH-2.0 \
    && printf . || printf X
done; echo
```

Any `X` at all means you have this. Fix it on the server:

```bash
sudo ./server/fix-ssh-connection-drops.sh --dry-run
sudo ./server/fix-ssh-connection-drops.sh
```

`with-retry.sh` already absorbs it from the pipeline side (6 attempts, ~1 in
3,300 chance of exhausting them). Keep both: the server fix removes the cause,
the retry wrapper handles the next unrelated blip.

**`Permission denied (publickey)`**
In order of likelihood:
1. `SERVER_SSH_KEY` holds the `.pub` file. It must be the **private** key.
2. The key was pasted without its trailing newline. Re-paste including the
   blank line after `-----END…`.
3. `SERVER_USERNAME` is wrong — the key is in a *different* user's
   `authorized_keys`.
4. Permissions on the server: `chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`.

Prove the key works outside CI first:
`ssh -i ~/.ssh/deploy_key USER@IP "echo ok"`.

**`Error loading key … invalid format`**
Truncated paste, or Windows line endings. Copy with `cat` in Git Bash, not
`type` in cmd.exe.

**`Host key verification failed`**
The `Trust remote host` step failed or was removed. It must run before rsync.

---

## The `deploy` job fails on the server

**`cd: /path/to/app: No such file or directory`**
`PROJECT_PATH` is wrong or has a trailing slash. SSH in, `cd` there, `pwd`,
paste exactly that.

**`Permission denied` writing files during rsync**
`SERVER_USERNAME` does not own `PROJECT_PATH`.
`sudo chown -R deploy:deploy /path/to/app` (on CloudPanel, the site user).

**`mysqldump: Access denied`**
Wrong `DB_USERNAME` / `DB_PASSWORD`, or the user lacks `SELECT, LOCK TABLES,
SHOW VIEW`. Verify from the server:
`mysqldump -h127.0.0.1 -uUSER -p DB > /dev/null`.

**`WARNING: mysqldump not found — skipping DB backup`**
`sudo apt install mysql-client` (or `mariadb-client`). The deploy continues
without a backup — do not leave it like this.

**`SQLSTATE[42S01]: Base table or view already exists`**
A migration is being re-applied because its row is missing from `migrations`,
usually after a hand-run migration or a restored database.
`php artisan migrate:status` shows the mismatch.

**`could not reload php-fpm.service (no sudo?)`**
Not fatal — PHP picks the change up within seconds via `validate_timestamps`.
To make it instant, see [SECRETS.md §5a](./SECRETS.md). Remember the unit name
is discovered at runtime and is often `php-fpm.service`, not `php8.2-fpm`.

---

## The deploy is green but the site is wrong

**Old CSS/JS still loading**
Work down the list in [RECIPE.md §8](./RECIPE.md). In practice it is one of:
1. `FreshHtml` not registered in `bootstrap/app.php` — this is the usual cause;
2. behind Cloudflare with no purge secrets — add them, or purge by hand;
3. your own browser. Test in a private window before blaming the pipeline.

**`500 Server Error` right after the first deploy**
```bash
tail -50 storage/logs/laravel.log
```
Nearly always: `.env` incomplete because `.env.example` was incomplete, or
`APP_KEY` empty (`php artisan key:generate`), or `storage/` not writable
(`chmod -R ug+rwX storage bootstrap/cache`).

**Assets 404, or they point at `localhost:5173`**
`public/hot` reached the server. Delete it there and confirm it is in the rsync
exclude list. Then check `public/build/manifest.json` exists — if not, the
build step produced nothing.

**Uploaded images 404 after a deploy**
`php artisan storage:link` (post-deploy runs it, but it is a no-op if the
symlink path is occupied by a real directory — remove that directory first).

**User uploads disappeared**
`storage/app/` was not excluded from rsync. Restore from backup, add the
exclude, and re-check §6 of the RECIPE for every other writable path your app
owns.

**Everyone got logged out**
File-based sessions plus `rsync --delete`. Move to
`SESSION_DRIVER=database` and run the sessions migration.

---

## Cloudflare

**Purge step skipped**
Both `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` must exist. The `if:`
reads job-level `env:`, not `secrets` — do not move the check inline.

**`Authentication error (code 10000)`**
The token needs **Zone · Cache Purge · Purge** on that specific zone. An
account-level token without the zone in its resource list returns this.

---

## Still stuck

1. Read the whole Actions log — the first red step is rarely the interesting
   one; the *first warning* usually is.
2. Reproduce the failing step by hand over SSH. Nine times in ten it fails the
   same way with a much better error message.
3. `php artisan about` on the server tells you which env, cache driver and
   database it actually booted with — often not the one you assumed.

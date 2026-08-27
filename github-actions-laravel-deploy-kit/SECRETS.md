# SECRETS — every value, and exactly where to get it

> **This is the human's page.** Ten minutes, once per project. Your AI agent can
> do everything else in [`RECIPE.md`](./RECIPE.md), but it cannot read your
> server password or click through GitHub's settings UI — so this part is yours.
>
> Work top to bottom. At the end, run the checklist in §6 **before** you push.

---

## 1. Make a deploy key (2 minutes)

A key pair is a lock and a key. The **public** half (the lock) goes on your
server; the **private** half (the key) goes into GitHub Secrets. GitHub then
lets itself in without anybody ever typing a password.

Run this **on your own computer** (Git Bash on Windows, Terminal on macOS/Linux):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""
```

- `-f ~/.ssh/deploy_key` — a **dedicated** key for deploys. Never reuse your
  personal `id_rsa`: if a deploy key ever leaks you revoke one line on one
  server, not your whole identity.
- `-N ""` — **no passphrase**. This is deliberate. GitHub Actions runs
  unattended and has nobody to type a passphrase; a key with one simply hangs.
  That is exactly why it must be a throwaway deploy key and nothing else.
- Old server that rejects ed25519? Use `ssh-keygen -t rsa -b 4096` instead.

You now have two files:

| File | Which half | Where it goes |
|---|---|---|
| `~/.ssh/deploy_key.pub` | **public** (the lock) | your server's `~/.ssh/authorized_keys` |
| `~/.ssh/deploy_key` | **private** (the key) | GitHub secret `SERVER_SSH_KEY` |

## 2. Put the public half on the server

```bash
# easiest — one command, from your computer:
ssh-copy-id -i ~/.ssh/deploy_key.pub YOUR_USER@YOUR_SERVER_IP
```

No `ssh-copy-id` (Windows often has none)? By hand:

```bash
cat ~/.ssh/deploy_key.pub            # copy the single line it prints

ssh YOUR_USER@YOUR_SERVER_IP
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys          # paste the line on its own line, save
chmod 600 ~/.ssh/authorized_keys
exit
```

**Prove it works before going further** — this must log in with no password:

```bash
ssh -i ~/.ssh/deploy_key YOUR_USER@YOUR_SERVER_IP "echo IT WORKS"
```

If it asks for a password, the deploy will fail the same way. Fix it here.
(Nine times out of ten: wrong `chmod`, or the key pasted onto two lines.)

## 3. The seven required secrets

**GitHub → your repository → Settings → Secrets and variables → Actions →
New repository secret.** Names are case-sensitive; copy them exactly.

Secrets are write-only. GitHub never shows you a value again, and Actions logs
mask them automatically — a secret cannot be leaked by an `echo`.

### Server access

| Name | Example | Where to get it |
|---|---|---|
| `SERVER_IP` | `203.0.113.42` | Your VPS dashboard (DigitalOcean / Hetzner / Contabo / CloudPanel). The public IPv4. A hostname like `srv1.example.com` works too. |
| `SERVER_USERNAME` | `deploy` · `ubuntu` · `root` | The user you just tested SSH with in §2. On CloudPanel this is the **site user**, not root. |
| `SERVER_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----`… | Run `cat ~/.ssh/deploy_key` and paste **the entire output** — see the warning below. |
| `PROJECT_PATH` | `/home/mysite/htdocs/mysite.com` | Where the app lives on the server. SSH in, `cd` there, run `pwd`. **No trailing slash.** |

> ### ⚠️ `SERVER_SSH_KEY` — the one that catches everyone
>
> Paste the **private** key (`deploy_key`, no `.pub`), **whole**: the
> `-----BEGIN…` line, every line of the body, the `-----END…` line, **and the
> blank line after it**. An OpenSSH key without its trailing newline is rejected
> as malformed, and the error you get (`invalid format`) does not say so.
>
> On Windows use Git Bash — `cat` there gives clean output, while `type` in
> cmd.exe can mangle line endings.
>
> Never paste the `.pub` file here. That is the lock, not the key.

### Database

The workflow uses these two ways: it takes a **`mysqldump` backup before every
migration**, and on the **very first deploy only** it writes them into the
server's fresh `.env`. After that it never touches `.env` again.

| Name | Example | Where to get it |
|---|---|---|
| `DB_DATABASE` | `mysite_production` | Your live database name. CloudPanel → Databases. Or read it off the server: `grep DB_ $PROJECT_PATH/.env` |
| `DB_USERNAME` | `mysite_user` | Same place. |
| `DB_PASSWORD` | `••••••••` | Same place. If you have lost it, reset it in your panel and update the server's `.env` to match. |

**Why put a production password in GitHub at all?** Because every alternative is
worse: hard-coded in the repo, or a deploy that migrates with no backup. GitHub
encrypts secrets at rest, decrypts them only inside your own workflow run, and
masks them in every log line. This kit additionally passes them to the server
**on stdin, never as command-line arguments** — so `DB_PASSWORD` never appears
in the server's process list, where any other user could read it with `ps`.

## 4. Optional secrets

Add these only if they apply. Each is skipped silently when absent, so the
workflow stays correct without them.

| Name | Add it when | Where to get it |
|---|---|---|
| `CLOUDFLARE_ZONE_ID` | your domain is behind Cloudflare | Cloudflare dashboard → your domain → **Overview** → right column, near the bottom. |
| `CLOUDFLARE_API_TOKEN` | same | Cloudflare → My Profile → **API Tokens** → Create Token → *Custom token* → Permissions: **Zone · Cache Purge · Purge**; Zone Resources: your zone. Copy it once — it is never shown again. |

Both must exist, or the purge step is skipped.

## 5. One-time server preparation

Things the secrets cannot do for you. **(a) and (b) are required.**

### a) Preflight — four checks, five seconds

Paste this on the server. Every line must answer.

```bash
whoami; pwd                            # → SERVER_USERNAME and PROJECT_PATH
command -v rsync      || echo "MISSING → sudo apt install rsync"
command -v mysqldump  || echo "MISSING → sudo apt install mysql-client"
php -v | head -1                       # the CLI PHP that will run `artisan`
```

- **`rsync` must exist on the server**, not just on GitHub's runner. Missing, the
  deploy dies mid-transfer with an error that reads like a network fault.
- **`mysqldump` missing does not stop the deploy** — it prints a warning and
  migrates anyway. Green deploy, no backup. Install it.
- **PHP CLI is often a different build from PHP-FPM.** `artisan` runs on the
  CLI one. If it is older than your app needs, `migrate` fails *after* the new
  files have already shipped.

### b) Point the web root at `public/`

Your web server must serve **`PROJECT_PATH/public`**, never `PROJECT_PATH`.

```bash
grep -rn "root " /etc/nginx/sites-enabled/ | head    # must end in /public
```

Point it one level too high and your entire application source — **`.env`
included, with the database password in it** — is downloadable over HTTP. Check
this before the site is public. On CloudPanel / Plesk this is the site's
"document root" field and is usually already correct; on a hand-rolled nginx
vhost it is the single most common mistake.

### c) Upload limits, if the app accepts files

Laravel's own validation cannot raise these — PHP rejects the request before
your code ever runs, and the user sees an empty page rather than an error.

```ini
# php.ini (or the FPM pool)
upload_max_filesize = 12M
post_max_size = 64M      # must cover a whole multi-file batch, not one file
```
```nginx
# nginx / CloudPanel vhost
client_max_body_size 64M;
```

### d) Let the deploy user reload PHP-FPM

Without this, OPcache can keep serving yesterday's compiled PHP for a few
seconds after a deploy. Find the real unit name first — it is **not** always
`php8.2-fpm`:

```bash
systemctl list-units --type=service | grep fpm
```

Then, as root, using your actual username and the unit name you just saw:

```bash
echo 'deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload php-fpm.service' \
  | sudo tee /etc/sudoers.d/deploy
sudo chmod 440 /etc/sudoers.d/deploy
sudo visudo -c            # must print "parsed OK"
```

Get the username or the unit name wrong and sudo declines **silently**: the
deploy still goes green, and OPcache serves stale bytecode until PHP notices on
its own. The deploy log tells you — look for `could not reload … (no sudo?)`.

### e) Raise the SSH pre-auth queue

Only if deploys fail with `kex_exchange_identification: Connection reset by
peer`. That is not a network fault — see
[TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

```bash
sudo ./server/fix-ssh-connection-drops.sh --dry-run   # look first
sudo ./server/fix-ssh-connection-drops.sh             # apply
```

Keep a second terminal open on the server while you run it. The script
validates with `sshd -t` before applying and `reload`s rather than restarts, so
your session is never dropped — but that second terminal is how you fix things
if it ever is.

## 6. Checklist — before your first push

- [ ] `ssh -i ~/.ssh/deploy_key USER@IP "echo ok"` logs in with **no password**
- [ ] Preflight (§5a) passed: `rsync` **and** `mysqldump` both present, CLI PHP
      new enough for the app
- [ ] The web root ends in `/public` (§5b) — check before the site is public
- [ ] All **seven** secrets exist, spelled exactly as in §3
- [ ] `PROJECT_PATH` has **no trailing slash** and `cd`s successfully on the server
- [ ] `.env.example` is **committed** — the first deploy builds the server's
      `.env` from it, and without it the first deploy dies
- [ ] `.env` is in `.gitignore` and **not** committed
- [ ] The database named in `DB_DATABASE` **already exists** (this kit migrates
      it; it never creates it)
- [ ] Your production branch matches `branches:` in `deploy.yml`
- [ ] `composer.lock` and `package-lock.json` are committed (`npm ci` requires
      the lockfile)

Then: **Actions** tab → watch the run. Green means live.

## Rotating or revoking a key

```bash
# 1. new pair
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key_new -N ""
# 2. add the new PUBLIC key to the server's authorized_keys — keep the old line for now
# 3. update the SERVER_SSH_KEY secret with the new PRIVATE key
# 4. deploy once. Green?
# 5. only now delete the old line from ~/.ssh/authorized_keys
```

Never do step 5 before step 4.

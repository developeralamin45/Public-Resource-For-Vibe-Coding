#!/usr/bin/env bash
# Post-deploy steps, run ON the production server.
#
# This used to live inline in deploy.yml under appleboy/ssh-action. It moved
# out to a file so the deploy step can be retried: the server's sshd refuses
# roughly a quarter of connections outright ("Exceeded MaxStartups", see
# with-retry.sh), and a step that cannot be retried turns that into a failed
# deploy. Being a real file also means shellcheck and `bash -n` can see it.
#
# Expects in the environment: PROJECT_PATH, DB_DATABASE, DB_USERNAME, DB_PASSWORD

set -e
cd "$PROJECT_PATH"

# --- make sure the storage skeleton exists (first deploy) ---
mkdir -p storage/app/public storage/app/backups \
         storage/framework/cache/data storage/framework/sessions storage/framework/views \
         storage/logs bootstrap/cache

# --- first deploy only: create .env from the example, never touch it again ---
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^DB_HOST=.*|DB_HOST=127.0.0.1|" .env
  sed -i "s|^DB_DATABASE=.*|DB_DATABASE=${DB_DATABASE}|" .env
  sed -i "s|^DB_USERNAME=.*|DB_USERNAME=${DB_USERNAME}|" .env
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD}|" .env
  # safe defaults so the site works before Redis/SMTP are configured
  sed -i "s|^QUEUE_CONNECTION=.*|QUEUE_CONNECTION=sync|" .env
  sed -i "s|^CACHE_STORE=.*|CACHE_STORE=file|" .env
  sed -i "s|^MAIL_MAILER=.*|MAIL_MAILER=log|" .env
  php artisan key:generate --force
  echo "NOTE: .env created on first deploy from .env.example."
  echo "      Review MAIL / payment-gateway / OAuth values on the server before going live."
fi

# --- timestamped DB backup BEFORE touching the schema ---
if command -v mysqldump >/dev/null 2>&1; then
  mysqldump -h127.0.0.1 -u"$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE" \
    | gzip > "storage/app/backups/pre-deploy-$(date +%Y%m%d-%H%M%S).sql.gz"
  # keep only the 10 most recent backups
  ls -tp storage/app/backups/*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm --
else
  echo "WARNING: mysqldump not found — skipping DB backup"
fi

# --- safe migration: additive only, never fresh/wipe, data stays ---
php artisan migrate --force

# --- storage symlink ---
php artisan storage:link || true

# ================= CACHE BUSTING =================
# Four separate caches hold yesterday's code after a deploy. Miss
# any one of them and the new build is invisible to somebody.

# 1. Laravel's compiled config/routes/views/events. optimize:clear
#    drops all of them at once, then we rebuild for speed.
php artisan optimize:clear

# 2. The application cache — site settings, the build fingerprint,
#    anything remember()ed. Sessions live in the database, so this
#    never logs anybody out.
php artisan cache:clear

# 3. Rebuild, in dependency order.
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

# 4. OPcache — PHP keeps COMPILED bytecode in the FPM workers'
#    memory. rsync replaces the .php files but a worker can keep
#    serving the old bytecode until it revalidates. A pool reload
#    is instant and drops zero requests. Needs sudo; if the deploy
#    user does not have it, PHP's default validate_timestamps
#    picks the change up within seconds anyway.
if command -v systemctl >/dev/null 2>&1; then
  FPM_SERVICE=$(systemctl list-units --type=service --all --no-legend 2>/dev/null \
                | grep -oE 'php[0-9.]*-fpm\.service' | head -1)
  if [ -n "$FPM_SERVICE" ]; then
    sudo systemctl reload "$FPM_SERVICE" 2>/dev/null \
      && echo "OPcache cleared (reloaded $FPM_SERVICE)" \
      || echo "NOTE: could not reload $FPM_SERVICE (no sudo?) — relying on opcache.validate_timestamps"
  fi
fi

# --- permissions for web server + pick up new code in queue workers ---
chmod -R ug+rwX storage bootstrap/cache
php artisan queue:restart || true

# Warm the new build fingerprint so the first visitor does not pay
# for it, and prove the app boots on the new code.
php artisan about --only=environment >/dev/null

echo "Deploy finished OK"

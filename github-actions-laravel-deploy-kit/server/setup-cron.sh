#!/usr/bin/env bash
#
# Installs the one crontab line every scheduled job in this app depends on.
#
#   ./scripts/setup-cron.sh
#
# Safe to run repeatedly: if the line is already there, nothing changes.
# Run it as the same user the web server runs as (often www-data), so the
# scheduler can write to storage/.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PHP_BIN="$(command -v php || true)"

if [ -z "$PHP_BIN" ]; then
    echo "✗ php not found on PATH. Install PHP or edit this script with its full path." >&2
    exit 1
fi

CRON_LINE="* * * * * cd ${APP_DIR} && ${PHP_BIN} artisan schedule:run >> /dev/null 2>&1"

echo "App:  ${APP_DIR}"
echo "PHP:  ${PHP_BIN}"
echo "User: $(whoami)"
echo

# `crontab -l` exits non-zero when the user has no crontab yet — that is not an
# error here, it just means we are writing the first line.
EXISTING="$(crontab -l 2>/dev/null || true)"

if printf '%s\n' "$EXISTING" | grep -qF "artisan schedule:run"; then
    echo "✓ Already installed — nothing to do."
    printf '%s\n' "$EXISTING" | grep -F "artisan schedule:run"
    exit 0
fi

printf '%s\n%s\n' "$EXISTING" "$CRON_LINE" | sed '/^$/d' | crontab -

echo "✓ Installed:"
echo "  ${CRON_LINE}"
echo
echo "Verifying (this may take up to a minute)…"
"$PHP_BIN" "${APP_DIR}/artisan" schedule:run >/dev/null 2>&1 || true
"$PHP_BIN" "${APP_DIR}/artisan" schedule:list
echo
echo "Done. Cron now drives 'schedule:run' every minute; Laravel decides what is actually due."

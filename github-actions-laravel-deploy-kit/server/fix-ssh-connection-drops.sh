#!/usr/bin/env bash
#
# Stop sshd refusing connections, which was failing ~60% of our deploys.
#
# THE PROBLEM
# -----------
# Deploys kept dying with "kex_exchange_identification: Connection reset by
# peer" — sometimes on ssh-keyscan, sometimes on rsync, most often on the
# post-deploy step, which is the worst case: the files were already on the
# server but the caches never got cleared, so the site kept serving the old
# build.
#
# It looked like a network fault, but it is not. Measured from outside on
# 2026-08-21, thirty single, strictly sequential connections — no concurrency
# of our own at all — were answered like this:
#
#     ..X.......XX..X..XX...XX......    22 OK, 8 refused (26%)
#
# and the refusals carried sshd's own message: "Exceeded MaxStartups". So this
# is not the firewall, not fail2ban and not the network. It is sshd's pre-auth
# queue being full before we even knock.
#
# WHY THE QUEUE IS FULL
# ---------------------
# Port 22 is public and permanently scanned. Every bot that opens a connection
# holds a queue slot until it authenticates or LoginGraceTime expires. The
# stock settings are:
#
#     MaxStartups 10:30:100     10 unauthenticated connections
#     LoginGraceTime 120        each may sit there for two minutes
#
# That is only 10 x 120 = 1200 slot-seconds per minute of capacity, so a
# scanner opening ~5 connections a minute and stalling on each one is enough to
# lock everyone else out. Nobody is breaking in — the box is publickey-only —
# but they crowd the doorway.
#
# WHAT THIS CHANGES
# -----------------
#     LoginGraceTime 30         a real login needs under a second; 120 only
#                               ever helps somebody who is stalling
#     MaxStartups 100:30:200    ten times the doorway
#     PerSourceMaxStartups 12   one address can no longer take it all; a
#                               deploy uses three connections, well under it
#
# Together that is roughly forty times the pre-auth capacity, which puts the
# bot traffic back into the noise where it belongs.
#
# Nothing here weakens authentication. Auth stays publickey-only, exactly as
# it was; this only governs how many people may stand in the doorway and for
# how long.
#
# SAFETY
# ------
#   - config goes in a drop-in, so the distro's sshd_config is never edited
#   - `sshd -t` must pass before anything is applied; if it does not, the
#     drop-in is removed and sshd is left untouched
#   - `reload`, never `restart` — your current session is not dropped
#   - re-runnable; --revert undoes it
#
# Keep a second terminal open on the server while running this. If SSH ever
# does break, that session is how you fix it.
#
# Usage:
#   sudo ./fix-ssh-connection-drops.sh              apply
#   sudo ./fix-ssh-connection-drops.sh --dry-run    show, change nothing
#   sudo ./fix-ssh-connection-drops.sh --revert     remove the drop-in
#
set -euo pipefail

DROPIN=/etc/ssh/sshd_config.d/10-connection-throughput.conf
MODE=apply
[ "${1:-}" = "--dry-run" ] && MODE=dry-run
[ "${1:-}" = "--revert" ]  && MODE=revert

if [ "$(id -u)" -ne 0 ]; then
    echo "Needs root: sudo $0 ${1:-}" >&2
    exit 1
fi

# The service is 'ssh' on Debian/Ubuntu and 'sshd' on RHEL.
SERVICE=ssh
systemctl list-unit-files 2>/dev/null | grep -q '^sshd\.service' && SERVICE=sshd

show() {
    echo "--- effective settings ($1) ---"
    sshd -T 2>/dev/null | grep -Ei '^(maxstartups|logingracetime|persourcemaxstartups|permitrootlogin|passwordauthentication|pubkeyauthentication)' | sort | sed 's/^/    /'
}

show "before"

if [ "$MODE" = revert ]; then
    if [ -f "$DROPIN" ]; then
        rm -f "$DROPIN"
        sshd -t && systemctl reload "$SERVICE"
        echo "Reverted — drop-in removed, sshd reloaded."
    else
        echo "Nothing to revert; $DROPIN is not present."
    fi
    show "after"
    exit 0
fi

# Ubuntu's sshd_config pulls in the drop-in directory near the top, and sshd
# takes the FIRST value it sees for a keyword, so a drop-in wins. On anything
# that does not have the Include, bail out rather than silently do nothing.
if ! grep -qE '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/' /etc/ssh/sshd_config; then
    echo "ERROR: /etc/ssh/sshd_config has no Include for sshd_config.d/." >&2
    echo "       Add the settings to /etc/ssh/sshd_config by hand instead." >&2
    exit 1
fi

read -r -d '' CONF <<'CONF_EOF' || true
# Managed by scripts/server/fix-ssh-connection-drops.sh — read that file for
# the reasoning and the measurements behind these numbers.
#
# These govern the pre-auth queue only. Authentication is unchanged.

# A real login completes in well under a second. The stock 120 seconds only
# ever benefits a client that connects and then stalls, and each one of those
# occupies a connection slot for the whole two minutes.
LoginGraceTime 30

# Ten unauthenticated connections is not enough headroom on a public port 22:
# background scanning alone kept it saturated, so genuine connections were
# refused before key exchange about a quarter of the time.
MaxStartups 100:30:200

# No single address may swallow the queue. A deploy opens three connections.
PerSourceMaxStartups 12
CONF_EOF

if [ "$MODE" = dry-run ]; then
    echo "--- would write $DROPIN ---"
    printf '%s\n' "$CONF" | sed 's/^/    /'
    echo "--- (dry run: nothing changed) ---"
    exit 0
fi

BACKUP=""
if [ -f "$DROPIN" ]; then
    BACKUP="$DROPIN.bak"
    cp -p "$DROPIN" "$BACKUP"
fi

umask 022
printf '%s\n' "$CONF" > "$DROPIN"

# Validate BEFORE reloading. A bad config here would take SSH down with it.
if ! sshd -t 2>/tmp/sshd-test.err; then
    echo "ERROR: sshd rejected the new config — reverting, sshd untouched:" >&2
    sed 's/^/    /' /tmp/sshd-test.err >&2
    if [ -n "$BACKUP" ]; then mv "$BACKUP" "$DROPIN"; else rm -f "$DROPIN"; fi
    exit 1
fi
rm -f "$BACKUP"

# reload re-reads the config for NEW connections and leaves established ones
# alone — including the session running this script.
systemctl reload "$SERVICE"
sleep 1
systemctl is-active --quiet "$SERVICE" || { echo "ERROR: $SERVICE is not active!" >&2; exit 1; }

show "after"
echo
echo "Applied. Verify from your laptop — the drop rate should now be 0%:"
echo "    for i in \$(seq 1 30); do nc -G 8 -w 8 <server-ip> 22 </dev/null 2>&1 | head -1 | grep -q ^SSH-2.0 && printf . || printf X; done; echo"
echo
echo "To undo: sudo $0 --revert"

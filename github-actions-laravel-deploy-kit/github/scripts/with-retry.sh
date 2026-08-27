#!/usr/bin/env bash
# Run a command, retrying it while the production sshd keeps refusing us.
#
# Why this exists
# ---------------
# Port 22 on the production box is public and permanently scanned, which keeps
# sshd's pre-auth connection queue (MaxStartups, default 10:30:100) full. When
# the queue is full sshd drops new connections before the key exchange, so the
# client sees one of:
#
#     kex_exchange_identification: Connection reset by peer
#     ssh: handshake failed: ... connection reset by peer
#     Exceeded MaxStartups
#
# Measured from a developer machine on 2026-08-21: 8 of 30 single, sequential
# connections were refused — a 26% drop rate with no concurrency of our own.
# A deploy opens three connections (keyscan, rsync, post-deploy), so the odds
# of all three surviving were 0.74^3 ≈ 40%. That is the ~60% deploy failure
# rate we were living with, and it had nothing to do with the code being
# shipped: rsync would finish and the post-deploy step would still die,
# leaving the server holding new files behind stale caches.
#
# The real repair is server-side (raise MaxStartups, ban the scanners). This
# wrapper is the client-side half, and it is worth keeping afterwards — a
# dropped TCP connection is never a reason to fail a deploy. With six attempts
# the odds of a step exhausting them are 0.26^6, about 1 in 3,300.
#
# Every command it wraps is safe to run twice: rsync converges on the same
# tree, and post-deploy.sh re-runs migrations that are already applied as
# no-ops and simply rebuilds the caches.
#
# Usage:
#   .github/scripts/with-retry.sh rsync -az ./ host:/path/
#   RETRY_STDIN=payload.sh .github/scripts/with-retry.sh ssh host 'bash -s'
#
# RETRY_STDIN feeds each attempt from a file rather than a pipe. A pipe would
# be drained by the first attempt and every retry would send an empty script.
set -uo pipefail

attempts="${RETRY_ATTEMPTS:-6}"
delay="${RETRY_DELAY:-10}"

for attempt in $(seq 1 "$attempts"); do
    if [ -n "${RETRY_STDIN:-}" ]; then
        "$@" < "$RETRY_STDIN" && exit 0
    else
        "$@" && exit 0
    fi
    status=$?

    if [ "$attempt" -eq "$attempts" ]; then
        echo "::error::'$1' failed on all $attempts attempts (last exit $status)"
        exit "$status"
    fi

    echo "::warning::attempt $attempt/$attempts failed (exit $status) — retrying in ${delay}s"
    sleep "$delay"
    # Back off, but stay well inside the job timeout.
    delay=$(( delay * 2 > 60 ? 60 : delay * 2 ))
done

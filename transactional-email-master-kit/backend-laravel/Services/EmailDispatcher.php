<?php

namespace App\Services;

use App\Models\EmailLog;
use App\Models\EmailOutbox;
use App\Models\EmailTemplate;
use App\Models\SystemSetting;
use App\Mail\RenderedMail;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * The one door business logic sends mail through.
 *
 *     app(EmailDispatcher::class)->fire('order.shipped', $customer->email, [
 *         'name'     => $customer->name,
 *         'order_id' => $order->id,
 *         'courier'  => 'Pathao',
 *     ]);
 *
 * Everything the admin controls happens in here, so a controller never has to
 * know about it:
 *
 *   1. Is this event switched ON?           (email_templates.enabled)
 *   2. Is it a duplicate of one we just sent? (dedupe window)
 *   3. Are we inside quiet hours?           (queue it, don't drop it)
 *   4. Render {placeholders} into the admin's subject/body
 *   5. Hand to MailService (Gmail API / SMTP) and log the outcome
 *
 * THE RULE THAT MATTERS: fire() NEVER throws. An email failure must not roll
 * back an order or abort a registration — the user completed their action, and
 * a mail server having a bad day is not their problem. Failures are logged and
 * visible in the admin panel. Use sendNow() when you genuinely want to know.
 */
class EmailDispatcher
{
    public function __construct(private MailService $mail) {}

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Fire an event. Honours enable/disable, dedupe and quiet hours.
     *
     * @param  string $event  Key from config/email_events.php
     * @param  string $to     Recipient address
     * @param  array  $vars   {placeholder} => value
     * @return bool           True if sent or queued; false if skipped/failed.
     */
    public function fire(string $event, string $to, array $vars = []): bool
    {
        try {
            return $this->dispatch($event, $to, $vars);
        } catch (\Throwable $e) {
            // Last line of defence — see the class docblock.
            Log::error("EmailDispatcher::fire({$event}) failed: " . $e->getMessage());
            $this->log($event, $to, '', 'failed', $e->getMessage());
            return false;
        }
    }

    /**
     * Same rendering, but send immediately and let failures surface. Use in an
     * admin "send test" action where the operator is waiting for a real answer.
     *
     * @throws \Throwable
     */
    public function sendNow(string $event, string $to, array $vars = []): bool
    {
        return $this->dispatch($event, $to, $vars, force: true);
    }

    /**
     * Send one-off mail that is not in the catalogue (an admin broadcast, say).
     * Subject/body are used as given; {placeholders} still resolve.
     */
    public function sendRaw(string $to, string $subject, string $bodyHtml, array $vars = [], string $type = 'manual'): bool
    {
        try {
            $subject = $this->render($subject, $vars);
            $body    = $this->render($bodyHtml, $vars);
            $this->mail->send($to, new RenderedMail($subject, $body), $type);
            $this->log($type, $to, $subject, 'sent');
            return true;
        } catch (\Throwable $e) {
            $this->log($type, $to, $subject ?? '', 'failed', $e->getMessage());
            return false;
        }
    }

    // ── The pipeline ────────────────────────────────────────────────────────

    private function dispatch(string $event, string $to, array $vars, bool $force = false): bool
    {
        $def = $this->definition($event);

        if (!$def) {
            // A typo in an event key would otherwise fail silently forever.
            Log::warning("EmailDispatcher: unknown event '{$event}' — is it declared in config/email_events.php?");
            return false;
        }

        $template = EmailTemplate::where('event_key', $event)->first();

        // The DB row is the admin's copy and always wins; config is the default
        // for a project that has not run the seeder yet.
        $enabled  = $template ? (bool) $template->enabled : (bool) ($def['default_enabled'] ?? true);
        $subject  = $template->subject ?? $def['subject'] ?? '';
        $bodyHtml = $template->body    ?? $def['body']    ?? '';
        $critical = (bool) ($def['critical'] ?? false);

        if (!$force && !$enabled) {
            $this->log($event, $to, '', 'skipped', 'Event is switched off in the admin panel');
            return false;
        }

        // {app_name} is available to every template without anyone passing it.
        $vars = array_merge(['app_name' => config('email_events.brand.name')], $vars);

        $subject = $this->render($subject, $vars);
        $body    = $this->render($bodyHtml, $vars);

        // ── Dedupe: the same event to the same address twice in a few minutes
        // is nearly always a double-submitted form, not two real notices.
        // Critical mail is exempt: a user who asks for a second OTP means it.
        if (!$force && !$critical && $this->isDuplicate($event, $to)) {
            $this->log($event, $to, $subject, 'skipped', 'Duplicate within the dedupe window');
            return false;
        }

        // ── Quiet hours: hold, never drop. Critical mail goes out regardless —
        // nobody waits until 8am for a password-reset link.
        if (!$force && !$critical && ($releaseAt = $this->quietUntil())) {
            EmailOutbox::create([
                'event_key'  => $event,
                'to_email'   => $to,
                'subject'    => $subject,
                'body'       => $body,
                'send_after' => $releaseAt,
            ]);
            $this->log($event, $to, $subject, 'queued', 'Held for quiet hours until ' . $releaseAt->toDateTimeString());
            return true;
        }

        $this->mail->send($to, new RenderedMail($subject, $body), $event);
        $this->log($event, $to, $subject, 'sent');
        return true;
    }

    /** Deliver one row the outbox released. Used by the flush command. */
    public function deliverQueued(EmailOutbox $row): bool
    {
        try {
            $this->mail->send($row->to_email, new RenderedMail($row->subject, $row->body), $row->event_key);
            $this->log($row->event_key, $row->to_email, $row->subject, 'sent');
            $row->delete();
            return true;
        } catch (\Throwable $e) {
            $row->increment('attempts');
            $row->update(['last_error' => $e->getMessage()]);

            // Give up after 5 tries so one poisoned row cannot block the queue
            // forever — it stays in email_logs as a failure for the admin.
            if ($row->attempts >= 5) {
                $this->log($row->event_key, $row->to_email, $row->subject, 'failed', $e->getMessage());
                $row->delete();
            }
            return false;
        }
    }

    // ── Catalogue ───────────────────────────────────────────────────────────

    /** Every event for the active preset: common events + the preset's own. */
    public function catalogue(): array
    {
        $preset = config('email_events.preset', 'saas');

        return array_merge(
            config('email_events.common', []),
            config("email_events.presets.{$preset}", [])
        );
    }

    public function definition(string $event): ?array
    {
        return $this->catalogue()[$event] ?? null;
    }

    // ── Rendering ───────────────────────────────────────────────────────────

    /**
     * Replace {placeholders}. A placeholder with no value becomes an empty
     * string — printing a raw "{order_id}" to a customer looks broken, and a
     * blank reads as merely terse.
     */
    public function render(string $text, array $vars): string
    {
        foreach ($vars as $key => $value) {
            $text = str_replace('{' . $key . '}', (string) $value, $text);
        }

        return preg_replace('/\{[a-z0-9_]+\}/i', '', $text) ?? $text;
    }

    // ── Scheduling ──────────────────────────────────────────────────────────

    /**
     * When may we next send? NULL means "right now".
     *
     * Handles the window that crosses midnight (22:00 → 08:00), which is the
     * one people actually configure and the one naive comparisons get wrong.
     */
    private function quietUntil(): ?Carbon
    {
        if ($this->setting('email_quiet_enabled', '0') !== '1') {
            return null;
        }

        $tz    = $this->setting('email_timezone', config('app.timezone', 'UTC'));
        $now   = Carbon::now($tz);
        $start = $this->timeToday($this->setting('email_quiet_start', '22:00'), $tz, $now);
        $end   = $this->timeToday($this->setting('email_quiet_end', '08:00'), $tz, $now);

        if ($start->lte($end)) {
            // Same-day window, e.g. 01:00 → 06:00
            return $now->between($start, $end) ? $end : null;
        }

        // Crosses midnight, e.g. 22:00 → 08:00
        if ($now->gte($start)) {
            return $end->copy()->addDay();   // tonight → tomorrow morning
        }
        if ($now->lte($end)) {
            return $end;                     // early morning → this morning
        }

        return null;
    }

    private function timeToday(string $hhmm, string $tz, Carbon $ref): Carbon
    {
        [$h, $m] = array_pad(explode(':', $hhmm), 2, '0');

        return $ref->copy()->setTime((int) $h, (int) $m, 0);
    }

    private function isDuplicate(string $event, string $to): bool
    {
        $mins = (int) $this->setting('email_dedupe_minutes', '0');
        if ($mins <= 0) {
            return false;
        }

        return EmailLog::where('type', $event)
            ->where('to_email', $to)
            ->whereIn('status', ['sent', 'queued'])
            ->where('created_at', '>=', now()->subMinutes($mins))
            ->exists();
    }

    // ── Plumbing ────────────────────────────────────────────────────────────

    private function log(string $type, string $to, string $subject, string $status, ?string $error = null): void
    {
        try {
            EmailLog::create([
                'type'          => $type,
                'to_email'      => $to,
                'subject'       => mb_substr($subject, 0, 255),
                'status'        => $status,
                'error_message' => $error,
            ]);
        } catch (\Throwable $e) {
            // Logging must never be the thing that breaks a send.
            Log::warning('EmailLog write failed: ' . $e->getMessage());
        }
    }

    /**
     * Per-instance, deliberately NOT static: a queue worker lives for hours, and
     * a static cache there would serve settings the admin changed long ago.
     * Laravel resolves this class fresh per injection, so one instance is one
     * unit of work.
     */
    private ?array $settings = null;

    private function setting(string $key, string $default = ''): string
    {
        if ($this->settings === null) {
            // One query per instance for every setting this class reads.
            $this->settings = SystemSetting::whereIn('key', [
                'email_quiet_enabled', 'email_quiet_start', 'email_quiet_end',
                'email_timezone', 'email_dedupe_minutes',
            ])->pluck('value', 'key')->toArray();
        }

        $v = $this->settings[$key] ?? null;

        return ($v === null || $v === '') ? $default : (string) $v;
    }
}

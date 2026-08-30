<?php

namespace App\Http\Controllers;

use App\Mail\TestEmail;
use App\Models\EmailLog;
use App\Models\EmailOutbox;
use App\Models\SystemSetting;
use App\Services\MailService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Credentials, sender identity, send schedule, analytics and the test button.
 *
 * MUST be behind admin auth — see routes.example.php. Everything here either
 * reads or writes mail credentials.
 */
class EmailSettingsController extends Controller
{
    public function __construct(private MailService $mail) {}

    /** Keys this controller owns. One list, so read and write can never drift. */
    private const KEYS = [
        // Sender identity (used by both send paths)
        'smtp_from_address', 'smtp_from_name',
        // Generic SMTP
        'smtp_host', 'smtp_port', 'smtp_username', 'smtp_password',
        // Gmail API (preferred — port 443, never blocked)
        'gmail_client_id', 'gmail_client_secret', 'gmail_refresh_token',
        // Schedule
        'email_quiet_enabled', 'email_quiet_start', 'email_quiet_end',
        'email_timezone', 'email_dedupe_minutes',
    ];

    // ── Read ────────────────────────────────────────────────────────────────

    public function show(): JsonResponse
    {
        $s = SystemSetting::whereIn('key', self::KEYS)->pluck('value', 'key');

        return response()->json([
            'smtp_from_address' => $s->get('smtp_from_address', config('mail.from.address')),
            'smtp_from_name'    => $s->get('smtp_from_name', config('mail.from.name', config('app.name'))),

            'smtp_host'     => $s->get('smtp_host', config('mail.mailers.smtp.host')),
            'smtp_port'     => (string) $s->get('smtp_port', (string) config('mail.mailers.smtp.port')),
            'smtp_username' => $s->get('smtp_username', config('mail.mailers.smtp.username')),

            // Secrets are NEVER returned. The UI shows "saved / not saved" and
            // an empty box means "leave it alone" on the next save. Returning
            // them would put a working refresh token in every browser cache,
            // proxy log and screen-share of the admin panel.
            'smtp_password_set'       => (bool) $s->get('smtp_password'),
            'gmail_client_secret_set' => (bool) $s->get('gmail_client_secret'),
            'gmail_refresh_token_set' => (bool) $s->get('gmail_refresh_token'),

            // Client ID is not a secret (it ships in every OAuth redirect).
            'gmail_client_id' => $s->get('gmail_client_id', ''),

            'email_quiet_enabled'  => $s->get('email_quiet_enabled', '0') === '1',
            'email_quiet_start'    => $s->get('email_quiet_start', '22:00'),
            'email_quiet_end'      => $s->get('email_quiet_end', '08:00'),
            'email_timezone'       => $s->get('email_timezone', config('app.timezone', 'UTC')),
            'email_dedupe_minutes' => (int) $s->get('email_dedupe_minutes', '0'),

            // Which path a send would actually take right now.
            'status' => $this->mail->status(),
        ]);
    }

    // ── Write ───────────────────────────────────────────────────────────────

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'smtp_from_address' => 'required|email',
            'smtp_from_name'    => 'required|string|max:120',

            'smtp_host'     => 'nullable|string|max:255',
            'smtp_port'     => 'nullable|integer|min:1|max:65535',
            'smtp_username' => 'nullable|string|max:255',
            'smtp_password' => 'nullable|string|max:500',

            'gmail_client_id'     => 'nullable|string|max:500',
            'gmail_client_secret' => 'nullable|string|max:500',
            'gmail_refresh_token' => 'nullable|string|max:1000',

            'email_quiet_enabled'  => 'boolean',
            'email_quiet_start'    => ['nullable', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'email_quiet_end'      => ['nullable', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'email_timezone'       => 'nullable|timezone',
            'email_dedupe_minutes' => 'nullable|integer|min:0|max:1440',
        ]);

        $save = [
            'smtp_from_address' => $data['smtp_from_address'],
            'smtp_from_name'    => $data['smtp_from_name'],
            'smtp_host'         => $data['smtp_host'] ?? '',
            'smtp_port'         => (string) ($data['smtp_port'] ?? ''),

            // Default the SMTP login to the sender address: for Gmail and most
            // providers they are the same, and an admin who leaves it blank
            // means "the account I just named".
            'smtp_username'     => trim((string) ($data['smtp_username'] ?? '')) ?: $data['smtp_from_address'],

            'email_quiet_enabled'  => !empty($data['email_quiet_enabled']) ? '1' : '0',
            'email_quiet_start'    => $data['email_quiet_start'] ?? '22:00',
            'email_quiet_end'      => $data['email_quiet_end'] ?? '08:00',
            'email_timezone'       => $data['email_timezone'] ?? config('app.timezone', 'UTC'),
            'email_dedupe_minutes' => (string) ($data['email_dedupe_minutes'] ?? 0),

            'gmail_client_id' => trim((string) ($data['gmail_client_id'] ?? '')),
        ];

        // A blank secret means "keep what is stored", not "erase it" — the UI
        // never sends the current value back, so treating blank as a delete
        // would wipe a working setup every time the admin edits the sender name.
        foreach (['smtp_password', 'gmail_client_secret', 'gmail_refresh_token'] as $secret) {
            $value = trim((string) ($data[$secret] ?? ''));
            if ($value !== '') {
                $save[$secret] = $value;
            }
        }

        foreach ($save as $key => $value) {
            SystemSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Email settings saved.',
            'status'  => $this->mail->status(),
        ]);
    }

    // ── Test ────────────────────────────────────────────────────────────────

    public function sendTest(Request $request): JsonResponse
    {
        $request->validate(['email' => 'required|email']);

        try {
            $this->mail->send($request->email, new TestEmail(), 'test');

            EmailLog::create([
                'type' => 'test', 'to_email' => $request->email,
                'subject' => 'Test email', 'status' => 'sent',
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Test email sent. Check the inbox (and the spam folder).',
            ]);
        } catch (\Throwable $e) {
            Log::error('Test email failed: ' . $e->getMessage());

            EmailLog::create([
                'type' => 'test', 'to_email' => $request->email,
                'subject' => 'Test email', 'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);

            // The real error goes to the admin verbatim: "Invalid credentials"
            // and "connection timed out" call for completely different fixes,
            // and a generic message sends people hunting in the wrong place.
            return response()->json([
                'success' => false,
                'message' => 'Sending failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ── Analytics & logs ────────────────────────────────────────────────────

    public function analytics(): JsonResponse
    {
        $from = Carbon::now()->startOfMonth();
        $to   = Carbon::now()->endOfMonth();

        // One grouped query, not four counts — see the same rule applied to the
        // logs endpoint below.
        $byStatus = EmailLog::whereBetween('created_at', [$from, $to])
            ->selectRaw('status, COUNT(*) as c')
            ->groupBy('status')
            ->pluck('c', 'status');

        $topEvents = EmailLog::whereBetween('created_at', [$from, $to])
            ->where('status', 'sent')
            ->selectRaw('type, COUNT(*) as c')
            ->groupBy('type')
            ->orderByDesc('c')
            ->limit(8)
            ->get();

        $sent   = (int) $byStatus->get('sent', 0);
        $failed = (int) $byStatus->get('failed', 0);

        return response()->json([
            'sent'         => $sent,
            'failed'       => $failed,
            'skipped'      => (int) $byStatus->get('skipped', 0),
            'queued'       => (int) $byStatus->get('queued', 0),
            'outbox_count' => EmailOutbox::count(),

            // The number an operator actually judges health by.
            'success_rate' => ($sent + $failed) > 0
                ? round($sent / ($sent + $failed) * 100, 1)
                : 100.0,

            'top_events' => $topEvents,
            'period'     => $from->toDateString() . ' → ' . $to->toDateString(),
        ]);
    }

    public function logs(Request $request): JsonResponse
    {
        $logs = EmailLog::query()
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->type, fn ($q, $t) => $q->where('type', $t))
            ->when($request->search, fn ($q, $s) => $q->where('to_email', 'like', "%{$s}%"))
            ->latest()
            ->paginate(min((int) $request->input('per_page', 25), 100));

        return response()->json($logs);
    }

    // ── Outbox (mail held by quiet hours) ───────────────────────────────────

    public function outbox(): JsonResponse
    {
        return response()->json(
            EmailOutbox::orderBy('send_after')
                ->limit(200)
                // Never ship the rendered body to a list view: it is large and
                // may contain a reset link or an OTP.
                ->get(['id', 'event_key', 'to_email', 'subject', 'send_after', 'attempts', 'last_error'])
        );
    }

    public function cancelQueued(int $id): JsonResponse
    {
        EmailOutbox::whereKey($id)->delete();

        return response()->json(['success' => true, 'message' => 'Queued email cancelled.']);
    }
}

<?php

namespace App\Http\Controllers;

use App\Mail\RenderedMail;
use App\Models\EmailTemplate;
use App\Services\EmailDispatcher;
use App\Services\MailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The event catalogue as the admin sees it: what emails exist, what each one
 * says, and whether it goes out at all.
 *
 * MUST be behind admin auth — see routes.example.php.
 */
class EmailTemplateController extends Controller
{
    public function __construct(
        private EmailDispatcher $dispatcher,
        private MailService $mail,
    ) {}

    // ── List ────────────────────────────────────────────────────────────────

    /**
     * The catalogue joined with the admin's saved rows, grouped for the UI.
     */
    public function index(): JsonResponse
    {
        $catalogue = $this->dispatcher->catalogue();
        $rows      = EmailTemplate::get()->keyBy('event_key');

        $events = [];
        foreach ($catalogue as $key => $def) {
            $row = $rows->get($key);

            $events[] = [
                'event_key' => $key,
                'label'     => $def['label'] ?? $key,
                'group'     => $def['group'] ?? 'Other',
                'audience'  => $def['audience'] ?? 'user',
                'critical'  => (bool) ($def['critical'] ?? false),
                'variables' => $def['variables'] ?? [],

                'subject' => $row->subject ?? $def['subject'] ?? '',
                'body'    => $row->body    ?? $def['body']    ?? '',
                'enabled' => $row ? (bool) $row->enabled : (bool) ($def['default_enabled'] ?? true),

                // False until the seeder has run — the UI can then prompt for it
                // rather than letting the admin edit a row that does not exist.
                'saved'    => (bool) $row,
                'edited'   => $row
                    ? ($row->subject !== ($def['subject'] ?? '') || $row->body !== ($def['body'] ?? ''))
                    : false,
                'defaults' => [
                    'subject' => $def['subject'] ?? '',
                    'body'    => $def['body'] ?? '',
                ],
            ];
        }

        // Rows whose event vanished from config — surfaced, not silently kept,
        // so a renamed event key cannot leave dead templates nobody notices.
        $orphans = $rows->keys()->diff(array_keys($catalogue))->values();

        return response()->json([
            'preset'  => config('email_events.preset'),
            'events'  => $events,
            'groups'  => collect($events)->pluck('group')->unique()->values(),
            'orphans' => $orphans,
        ]);
    }

    // ── Edit ────────────────────────────────────────────────────────────────

    public function update(Request $request, string $event): JsonResponse
    {
        if (!$this->dispatcher->definition($event)) {
            return response()->json(['message' => "Unknown event '{$event}'."], 404);
        }

        $data = $request->validate([
            'subject' => 'required|string|max:255',
            'body'    => 'required|string|max:50000',
            'enabled' => 'boolean',
        ]);

        $template = EmailTemplate::updateOrCreate(
            ['event_key' => $event],
            [
                'subject' => $data['subject'],
                'body'    => $data['body'],
                'enabled' => $request->boolean('enabled', true),
            ],
        );

        return response()->json([
            'success'  => true,
            'message'  => 'Template saved.',
            'template' => $template,
        ]);
    }

    public function toggle(Request $request, string $event): JsonResponse
    {
        $def = $this->dispatcher->definition($event);

        if (!$def) {
            return response()->json(['message' => "Unknown event '{$event}'."], 404);
        }

        $template = EmailTemplate::firstOrNew(['event_key' => $event]);
        $template->subject ??= $def['subject'] ?? '';
        $template->body    ??= $def['body'] ?? '';
        $template->enabled = $request->boolean('enabled');
        $template->save();

        // Switching off an OTP or reset email locks people out of their own
        // accounts. It is allowed — an admin may be mid-migration — but the
        // answer says so plainly rather than confirming silently.
        $warning = (!$template->enabled && ($def['critical'] ?? false))
            ? 'This is a critical email people wait for (login codes, password resets). '
              . 'With it off, they cannot complete those flows.'
            : null;

        return response()->json([
            'success' => true,
            'enabled' => $template->enabled,
            'warning' => $warning,
        ]);
    }

    /** Put the wording back to the catalogue default. */
    public function reset(string $event): JsonResponse
    {
        $def = $this->dispatcher->definition($event);

        if (!$def) {
            return response()->json(['message' => "Unknown event '{$event}'."], 404);
        }

        $template = EmailTemplate::updateOrCreate(
            ['event_key' => $event],
            ['subject' => $def['subject'] ?? '', 'body' => $def['body'] ?? ''],
        );

        return response()->json([
            'success'  => true,
            'message'  => 'Template reset to its default wording.',
            'template' => $template,
        ]);
    }

    // ── Preview & test ──────────────────────────────────────────────────────

    /**
     * Render with sample values so the admin sees the finished email, not a
     * page of {placeholders}. Accepts unsaved subject/body from the editor so
     * preview works before saving.
     */
    public function preview(Request $request, string $event): JsonResponse
    {
        $def = $this->dispatcher->definition($event);

        if (!$def) {
            return response()->json(['message' => "Unknown event '{$event}'."], 404);
        }

        $subject = $request->input('subject') ?? $def['subject'] ?? '';
        $body    = $request->input('body')    ?? $def['body'] ?? '';
        $vars    = $this->sampleVars($def);

        return response()->json([
            'subject' => $this->dispatcher->render($subject, $vars),
            'html'    => (new RenderedMail(
                $this->dispatcher->render($subject, $vars),
                $this->dispatcher->render($body, $vars),
            ))->render(),
            'sample_values' => $vars,
        ]);
    }

    /**
     * Send this one event to a chosen address with sample values.
     * Goes out even when the event is switched off — you are testing the
     * wording, not the toggle.
     */
    public function sendTest(Request $request, string $event): JsonResponse
    {
        $request->validate(['email' => 'required|email']);

        $def = $this->dispatcher->definition($event);

        if (!$def) {
            return response()->json(['message' => "Unknown event '{$event}'."], 404);
        }

        $vars    = $this->sampleVars($def);
        $subject = $request->input('subject') ?? $def['subject'] ?? '';
        $body    = $request->input('body')    ?? $def['body'] ?? '';

        try {
            $this->mail->send(
                $request->email,
                new RenderedMail(
                    $this->dispatcher->render($subject, $vars),
                    $this->dispatcher->render($body, $vars),
                ),
                'test',
            );

            return response()->json(['success' => true, 'message' => 'Test sent to ' . $request->email]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => 'Sending failed: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Plausible sample values, derived from each placeholder's name.
     *
     * Real-looking samples beat "Lorem": an admin spots that a date reads
     * "2026-13-45" or that a button has no link far more easily against
     * content shaped like the real thing.
     */
    private function sampleVars(array $def): array
    {
        $samples = [];

        foreach (array_keys($def['variables'] ?? []) as $key) {
            $samples[$key] = match (true) {
                str_contains($key, 'url')      => rtrim(config('app.url', 'https://example.com'), '/') . '/example',
                str_contains($key, 'email')    => 'customer@example.com',
                str_contains($key, 'phone')    => '01700-000000',
                str_contains($key, 'amount')   => '1,250',
                str_contains($key, 'total')    => '1,250',
                str_contains($key, 'otp')      => '482913',
                str_contains($key, 'date')     => now()->addDays(3)->toFormattedDateString(),
                str_contains($key, 'time')     => '10:30 AM',
                str_contains($key, 'days')     => '3',
                str_contains($key, 'mins')     => '15',
                str_contains($key, 'order_id') => '10428',
                str_contains($key, 'html')     => '<table><tr><th>Item</th><th>Qty</th></tr>'
                                                  . '<tr><td>Sample product</td><td>2</td></tr></table>',
                str_contains($key, 'name')     => 'Rahim Uddin',
                default                        => 'Sample ' . str_replace('_', ' ', $key),
            };
        }

        $samples['app_name'] = config('email_events.brand.name');

        return $samples;
    }
}

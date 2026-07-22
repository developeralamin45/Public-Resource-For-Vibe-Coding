<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\EmailLog;
use App\Models\SystemSetting;
use App\Services\MailService;
use App\Mail\TestEmail;
use Carbon\Carbon;

/**
 * Powers the admin Email Settings panel: this-month analytics, get/save the
 * Gmail-API (+ SMTP fallback) config, and a test-email sender.
 *
 * ⚠️ Protect these routes with your admin/super-admin middleware — they read and
 * write mail credentials.
 */
class EmailSettingsController extends Controller
{
    public function __construct(protected MailService $mailService) {}

    public function getAnalytics(Request $request)
    {
        $start = Carbon::now()->startOfMonth();
        $end   = Carbon::now()->endOfMonth();

        return response()->json([
            'welcome_emails_sent'    => EmailLog::where('type', 'welcome')->whereBetween('created_at', [$start, $end])->where('status', 'sent')->count(),
            'active_password_resets' => EmailLog::where('type', 'reset')->whereBetween('created_at', [$start, $end])->where('status', 'sent')->count(),
            'total_emails_sent'      => EmailLog::whereBetween('created_at', [$start, $end])->where('status', 'sent')->count(),
            'total_emails_failed'    => EmailLog::whereBetween('created_at', [$start, $end])->where('status', 'failed')->count(),
        ]);
    }

    public function sendTestEmail(Request $request)
    {
        $request->validate(['email' => 'required|email']);
        try {
            $this->mailService->send($request->email, new TestEmail(), 'test');
            return response()->json(['success' => true, 'message' => 'টেস্ট ইমেইল সফলভাবে পাঠানো হয়েছে!']);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Test email failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'ইমেইল পাঠাতে সমস্যা হয়েছে। কনফিগারেশন চেক করুন।',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function getSettings(): \Illuminate\Http\JsonResponse
    {
        $keys = [
            'smtp_username', 'smtp_password', 'smtp_from_address', 'smtp_from_name',
            'require_email_verification',
            'gmail_client_id', 'gmail_client_secret', 'gmail_refresh_token',
        ];
        $s = SystemSetting::whereIn('key', $keys)->pluck('value', 'key');

        return response()->json([
            'smtp_from_address'          => $s->get('smtp_from_address', config('mail.from.address')),
            'smtp_from_name'             => $s->get('smtp_from_name',    config('mail.from.name')),
            'require_email_verification' => $s->get('require_email_verification', '0') === '1',
            'gmail_client_id'            => $s->get('gmail_client_id', ''),
            'gmail_client_secret'        => $s->get('gmail_client_secret', ''),
            'gmail_refresh_token'        => $s->get('gmail_refresh_token', ''),
            'gmail_api_enabled'          => !empty($s->get('gmail_refresh_token')),
        ]);
    }

    public function updateSettings(Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'smtp_from_address'          => 'required|email',
            'smtp_from_name'             => 'required|string',
            'require_email_verification' => 'boolean',
            'smtp_password'              => 'nullable|string',
            'gmail_client_id'            => 'nullable|string',
            'gmail_client_secret'        => 'nullable|string',
            'gmail_refresh_token'        => 'nullable|string',
        ]);

        $toSave = [
            'smtp_from_address'          => $request->smtp_from_address,
            'smtp_from_name'             => $request->smtp_from_name,
            'require_email_verification' => $request->require_email_verification ? '1' : '0',
            // SMTP username mirrors the sender so the optional SMTP fallback works.
            'smtp_username'              => trim((string) ($request->smtp_username ?: $request->smtp_from_address)),
            'gmail_client_id'            => trim((string) $request->gmail_client_id),
            'gmail_client_secret'        => trim((string) $request->gmail_client_secret),
            'gmail_refresh_token'        => trim((string) $request->gmail_refresh_token),
        ];
        // Only overwrite the SMTP password when a new one is provided.
        if (trim((string) $request->smtp_password) !== '') {
            $toSave['smtp_password'] = trim((string) $request->smtp_password);
        }

        foreach ($toSave as $key => $value) {
            SystemSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        return response()->json(['success' => true, 'message' => 'ইমেইল সেটিংস সফলভাবে আপডেট করা হয়েছে!']);
    }
}

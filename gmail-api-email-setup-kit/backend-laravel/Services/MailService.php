<?php

namespace App\Services;

use App\Models\SystemSetting;
use App\Models\EmailLog;
use Exception;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Symfony\Component\Mailer\Mailer as SymfonyMailer;
use Symfony\Component\Mime\Email as SymfonyEmail;
use Symfony\Component\Mime\Address;

/**
 * MailService — sends transactional email with an automatic transport choice:
 *
 *   1. Gmail API over HTTPS (port 443) when OAuth credentials are configured.
 *      This is the PRIMARY path because many hosts (DigitalOcean, some shared
 *      hosts) block outbound SMTP ports (25/465/587) entirely — HTTPS is never
 *      blocked, so mail keeps working.
 *   2. Direct Gmail SMTP (587 STARTTLS, then 465 SSL) as a fallback when no
 *      Gmail API refresh token is present.
 *
 * All credentials live in the `system_settings` table (editable from the admin
 * panel), falling back to config/mail.php. Every send is logged to `email_logs`.
 */
class MailService
{
    private const SMTP_ATTEMPTS = [
        [587, false], // STARTTLS submission port (usually open)
        [465, true],  // implicit SSL (often blocked, tried second)
    ];
    private const CONNECT_TIMEOUT = 12; // seconds per attempt — fail fast

    private function getSmtpConfig(): array
    {
        $keys = ['smtp_username', 'smtp_password', 'smtp_from_address', 'smtp_from_name'];
        $db   = SystemSetting::whereIn('key', $keys)->pluck('value', 'key');

        return [
            'username'     => $db->get('smtp_username',     config('mail.mailers.smtp.username')),
            'password'     => $db->get('smtp_password',     config('mail.mailers.smtp.password')),
            'from_address' => $db->get('smtp_from_address', config('mail.from.address')),
            'from_name'    => $db->get('smtp_from_name',    config('mail.from.name', 'My App')),
        ];
    }

    private function getGmailApiConfig(): array
    {
        $keys = ['gmail_client_id', 'gmail_client_secret', 'gmail_refresh_token', 'smtp_from_address', 'smtp_from_name'];
        $db   = SystemSetting::whereIn('key', $keys)->pluck('value', 'key');

        return [
            'client_id'     => $db->get('gmail_client_id'),
            'client_secret' => $db->get('gmail_client_secret'),
            'refresh_token' => $db->get('gmail_refresh_token'),
            'from_address'  => $db->get('smtp_from_address', config('mail.from.address')),
            'from_name'     => $db->get('smtp_from_name', config('mail.from.name', 'My App')),
        ];
    }

    /**
     * Send a Laravel Mailable and log the result.
     *
     * @param string $type welcome | reset | test | otp | other
     */
    public function send(string $toEmail, $mailable, string $type = 'other'): bool
    {
        $gmailApi = $this->getGmailApiConfig();
        $useApi   = !empty($gmailApi['refresh_token']) && !empty($gmailApi['client_id']) && !empty($gmailApi['client_secret']);

        $smtpConfig = $this->getSmtpConfig();
        $rendered   = $this->renderMailable(
            $mailable,
            $useApi ? $gmailApi['from_address'] : $smtpConfig['from_address'],
            $useApi ? $gmailApi['from_name']    : $smtpConfig['from_name']
        );

        try {
            if ($useApi) {
                $this->sendViaGmailApi($gmailApi, $toEmail, $rendered['subject'], $rendered['html']);
            } else {
                $email = (new SymfonyEmail())
                    ->from(new Address($smtpConfig['from_address'], $smtpConfig['from_name']))
                    ->to($toEmail)
                    ->subject($rendered['subject'])
                    ->html($rendered['html'])
                    ->text(strip_tags($rendered['html']));
                $this->dispatch($email, $smtpConfig);
            }

            EmailLog::create(['type' => $type, 'to_email' => $toEmail, 'status' => 'sent']);
            return true;
        } catch (Exception $e) {
            EmailLog::create(['type' => $type, 'to_email' => $toEmail, 'status' => 'failed', 'error_message' => $e->getMessage()]);
            throw $e;
        }
    }

    /** Try each Gmail SMTP endpoint until one sends. @throws Exception if all fail. */
    private function dispatch(SymfonyEmail $email, array $config): void
    {
        $errors = [];
        foreach (self::SMTP_ATTEMPTS as [$port, $tls]) {
            try {
                $transport = $this->buildTransport($config, $port, $tls);
                (new SymfonyMailer($transport))->send($email);
                return;
            } catch (\Throwable $e) {
                $errors[] = "port {$port}: " . $e->getMessage();
            }
        }
        throw new Exception('All Gmail SMTP endpoints failed — ' . implode(' | ', $errors));
    }

    private function buildTransport(array $config, int $port, bool $tls): EsmtpTransport
    {
        $transport = new EsmtpTransport('smtp.gmail.com', $port, $tls);
        $transport->setUsername($config['username']);
        $transport->setPassword($config['password']);
        $stream = $transport->getStream();
        if (method_exists($stream, 'setTimeout')) {
            $stream->setTimeout(self::CONNECT_TIMEOUT);
        }
        return $transport;
    }

    /** Send one email through the Gmail API over HTTPS. @throws Exception on failure. */
    private function sendViaGmailApi(array $cfg, string $toEmail, string $subject, string $html): void
    {
        // 1) Refresh token → short-lived access token.
        $tokenResp = Http::asForm()->timeout(20)->post('https://oauth2.googleapis.com/token', [
            'client_id'     => $cfg['client_id'],
            'client_secret' => $cfg['client_secret'],
            'refresh_token' => $cfg['refresh_token'],
            'grant_type'    => 'refresh_token',
        ]);
        if (!$tokenResp->ok() || !$tokenResp->json('access_token')) {
            throw new Exception('Gmail API auth failed: ' . $tokenResp->body());
        }
        $accessToken = $tokenResp->json('access_token');

        // 2) Build a raw RFC-822 message (UTF-8 safe for non-ASCII scripts).
        $fromHeader = $this->encodeMimeWord($cfg['from_name']) . ' <' . $cfg['from_address'] . '>';
        $raw = implode("\r\n", [
            'From: ' . $fromHeader,
            'To: ' . $toEmail,
            'Subject: ' . $this->encodeMimeWord($subject),
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            chunk_split(base64_encode($html)),
        ]);
        $rawUrlSafe = rtrim(strtr(base64_encode($raw), '+/', '-_'), '='); // URL-safe, no padding

        // 3) Send as the authenticated account.
        $sendResp = Http::withToken($accessToken)->timeout(20)
            ->post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', ['raw' => $rawUrlSafe]);
        if (!$sendResp->ok()) {
            throw new Exception('Gmail API send failed: ' . $sendResp->body());
        }
    }

    /** RFC 2047 encoded-word for non-ASCII header values; plain ASCII unchanged. */
    private function encodeMimeWord(string $s): string
    {
        if (preg_match('/[^\x20-\x7E]/', $s)) {
            return '=?UTF-8?B?' . base64_encode($s) . '?=';
        }
        return $s;
    }

    /** Render a Laravel Mailable → subject + HTML. */
    private function renderMailable($mailable, string $fromAddress, string $fromName): array
    {
        $mailable->from($fromAddress, $fromName);
        $rendered = $mailable->render();
        $envelope = $mailable->envelope();
        return [
            'subject' => $envelope->subject ?? 'Notification',
            'html'    => $rendered,
        ];
    }
}

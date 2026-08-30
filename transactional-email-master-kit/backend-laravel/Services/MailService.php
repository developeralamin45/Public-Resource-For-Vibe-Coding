<?php

namespace App\Services;

use App\Models\EmailLog;
use App\Models\SystemSetting;
use Exception;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Mailer\Mailer as SymfonyMailer;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email as SymfonyEmail;

/**
 * The transport layer: it knows HOW to put a message on the wire, nothing about
 * events, toggles or schedules (that is EmailDispatcher's job).
 *
 * ── Why this exists instead of plain Mail::send() ───────────────────────────
 *
 * 1. CREDENTIALS LIVE IN THE DATABASE, not only .env. A non-technical admin can
 *    change the sending account from the panel without a deploy or SSH. .env
 *    stays as the fallback, so a fresh install works before anyone opens the
 *    panel.
 *
 * 2. GMAIL API OVER HTTPS. This is the hard-won part. Many hosts (DigitalOcean,
 *    most cloud VPS providers, plenty of shared hosts) BLOCK OUTBOUND SMTP
 *    PORTS ENTIRELY. Everything works on your laptop and silently times out in
 *    production. When Gmail OAuth credentials are present we send through the
 *    Gmail REST API on port 443 — a port nobody blocks. SMTP stays as the
 *    fallback for hosts where it is open.
 *
 * 3. PORT FALLBACK. When we do use SMTP we try 587 (STARTTLS) before 465
 *    (implicit TLS), because hosts that block one often leave the other open,
 *    with a short connect timeout so a blocked port fails fast instead of
 *    hanging the request for a minute.
 */
class MailService
{
    /** Connect timeout per SMTP attempt, in seconds. Short on purpose. */
    private const CONNECT_TIMEOUT = 12;

    /**
     * SMTP endpoints to try, in order: [port, implicitTls].
     * true = SMTPS/implicit TLS (465), false = STARTTLS (587).
     */
    private const SMTP_ATTEMPTS = [
        [587, false],
        [465, true],
    ];

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Send a Mailable and record the outcome.
     *
     * @param  string $to
     * @param  \Illuminate\Mail\Mailable $mailable
     * @param  string $type  Event key or category — powers the analytics cards.
     * @throws Exception     On failure, so the caller can react. EmailDispatcher
     *                       catches this; direct callers should decide for
     *                       themselves.
     */
    public function send(string $to, $mailable, string $type = 'other'): bool
    {
        $api      = $this->gmailApiConfig();
        $smtp     = $this->smtpConfig();
        $useApi   = $api['refresh_token'] && $api['client_id'] && $api['client_secret'];

        $fromAddress = $useApi ? $api['from_address'] : $smtp['from_address'];
        $fromName    = $useApi ? $api['from_name']    : $smtp['from_name'];

        $rendered = $this->renderMailable($mailable, $fromAddress, $fromName);

        try {
            if ($useApi) {
                $this->sendViaGmailApi($api, $to, $rendered['subject'], $rendered['html']);
            } else {
                $this->sendViaSmtp($smtp, $to, $rendered['subject'], $rendered['html']);
            }

            return true;
        } catch (\Throwable $e) {
            // Rethrow as a plain Exception with a message worth reading in the
            // admin panel's failure list.
            throw new Exception($e->getMessage(), 0, $e);
        }
    }

    /**
     * Which path would a send take right now? The admin panel shows this so an
     * operator can tell at a glance whether the API credentials actually took.
     *
     * @return array{mode:string, from:string, host:?string, ready:bool}
     */
    public function status(): array
    {
        $api  = $this->gmailApiConfig();
        $smtp = $this->smtpConfig();
        $useApi = $api['refresh_token'] && $api['client_id'] && $api['client_secret'];

        return [
            'mode'  => $useApi ? 'gmail_api' : 'smtp',
            'from'  => $useApi ? $api['from_address'] : $smtp['from_address'],
            'host'  => $useApi ? null : $smtp['host'],
            'ready' => $useApi
                ? (bool) $api['from_address']
                : (bool) ($smtp['host'] && $smtp['username'] && $smtp['password']),
        ];
    }

    // ── SMTP path ───────────────────────────────────────────────────────────

    private function sendViaSmtp(array $cfg, string $to, string $subject, string $html): void
    {
        $email = (new SymfonyEmail())
            ->from(new Address($cfg['from_address'], $cfg['from_name']))
            ->to($to)
            ->subject($subject)
            ->html($html)
            ->text($this->htmlToText($html));

        // An explicitly configured port is tried first; the standard pair is
        // then tried as a fallback, so a wrong port in settings self-heals.
        $attempts = [];
        if (!empty($cfg['port'])) {
            $attempts[] = [(int) $cfg['port'], (int) $cfg['port'] === 465];
        }
        foreach (self::SMTP_ATTEMPTS as $pair) {
            if (!in_array($pair, $attempts, true)) {
                $attempts[] = $pair;
            }
        }

        $errors = [];
        foreach ($attempts as [$port, $tls]) {
            try {
                $transport = new EsmtpTransport($cfg['host'], $port, $tls);
                $transport->setUsername($cfg['username']);
                $transport->setPassword($cfg['password']);

                // Fail fast on a blocked port instead of hanging ~60s.
                $stream = $transport->getStream();
                if (method_exists($stream, 'setTimeout')) {
                    $stream->setTimeout(self::CONNECT_TIMEOUT);
                }

                (new SymfonyMailer($transport))->send($email);
                return;
            } catch (\Throwable $e) {
                $errors[] = "port {$port}: " . $e->getMessage();
            }
        }

        throw new Exception(
            'Every SMTP endpoint failed — ' . implode(' | ', $errors)
            . '. If these are all timeouts, your host is blocking outbound SMTP:'
            . ' set up the Gmail API path instead (it uses port 443).'
        );
    }

    // ── Gmail API path (port 443) ───────────────────────────────────────────

    private function sendViaGmailApi(array $cfg, string $to, string $subject, string $html): void
    {
        // 1) Trade the long-lived refresh token for a short-lived access token.
        $token = Http::asForm()->timeout(20)->post('https://oauth2.googleapis.com/token', [
            'client_id'     => $cfg['client_id'],
            'client_secret' => $cfg['client_secret'],
            'refresh_token' => $cfg['refresh_token'],
            'grant_type'    => 'refresh_token',
        ]);

        if (!$token->ok() || !$token->json('access_token')) {
            throw new Exception(
                'Gmail API auth failed: ' . $token->body()
                . ' (a refresh token expires after 7 days while the OAuth app is'
                . ' still in "Testing" — publish it to Production.)'
            );
        }

        // 2) Build a raw RFC-822 message. Base64 body + encoded-word headers
        //    keep non-ASCII (Bangla, Arabic, emoji) intact.
        $raw = implode("\r\n", [
            'From: ' . $this->encodeMimeWord($cfg['from_name']) . ' <' . $cfg['from_address'] . '>',
            'To: ' . $to,
            'Subject: ' . $this->encodeMimeWord($subject),
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            chunk_split(base64_encode($html)),
        ]);

        // URL-safe base64 without padding — the Gmail API requires exactly this.
        $rawUrlSafe = rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');

        $send = Http::withToken($token->json('access_token'))->timeout(20)
            ->post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', [
                'raw' => $rawUrlSafe,
            ]);

        if (!$send->ok()) {
            throw new Exception('Gmail API send failed: ' . $send->body());
        }
    }

    // ── Config ──────────────────────────────────────────────────────────────

    /** DB settings first, .env second. */
    private function smtpConfig(): array
    {
        $db = SystemSetting::whereIn('key', [
            'smtp_host', 'smtp_port', 'smtp_username', 'smtp_password',
            'smtp_from_address', 'smtp_from_name',
        ])->pluck('value', 'key');

        return [
            'host'         => $db->get('smtp_host')     ?: config('mail.mailers.smtp.host'),
            'port'         => $db->get('smtp_port')     ?: config('mail.mailers.smtp.port'),
            'username'     => $db->get('smtp_username') ?: config('mail.mailers.smtp.username'),
            'password'     => $db->get('smtp_password') ?: config('mail.mailers.smtp.password'),
            'from_address' => $db->get('smtp_from_address') ?: config('mail.from.address'),
            'from_name'    => $db->get('smtp_from_name')    ?: config('mail.from.name', config('app.name')),
        ];
    }

    private function gmailApiConfig(): array
    {
        $db = SystemSetting::whereIn('key', [
            'gmail_client_id', 'gmail_client_secret', 'gmail_refresh_token',
            'smtp_from_address', 'smtp_from_name',
        ])->pluck('value', 'key');

        return [
            'client_id'     => $db->get('gmail_client_id')     ?: env('GMAIL_CLIENT_ID'),
            'client_secret' => $db->get('gmail_client_secret') ?: env('GMAIL_CLIENT_SECRET'),
            'refresh_token' => $db->get('gmail_refresh_token') ?: env('GMAIL_REFRESH_TOKEN'),
            'from_address'  => $db->get('smtp_from_address')   ?: config('mail.from.address'),
            'from_name'     => $db->get('smtp_from_name')      ?: config('mail.from.name', config('app.name')),
        ];
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** Render a Mailable down to subject + HTML. */
    private function renderMailable($mailable, ?string $fromAddress, ?string $fromName): array
    {
        if ($fromAddress) {
            $mailable->from($fromAddress, $fromName);
        }

        $html     = $mailable->render();
        $envelope = method_exists($mailable, 'envelope') ? $mailable->envelope() : null;

        return [
            'subject' => $envelope->subject ?? config('app.name') . ' notification',
            'html'    => $html,
        ];
    }

    /** RFC 2047 encoded-word for non-ASCII headers; ASCII passes through. */
    private function encodeMimeWord(string $s): string
    {
        return preg_match('/[^\x20-\x7E]/', $s)
            ? '=?UTF-8?B?' . base64_encode($s) . '?='
            : $s;
    }

    /** A readable plain-text alternative — spam filters mark HTML-only down. */
    private function htmlToText(string $html): string
    {
        $text = preg_replace('#<(br|/p|/div|/tr|/h[1-6])[^>]*>#i', "\n", $html) ?? $html;

        return trim(html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }
}

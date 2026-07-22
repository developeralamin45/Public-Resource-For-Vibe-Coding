<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The mailable sent by the "Test Email" button. Uses an inline HTML view so the
 * kit needs no extra Blade files — swap for your own branded template.
 */
class TestEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function envelope(): Envelope
    {
        return new Envelope(subject: '✅ Test Email — Your mail setup works!');
    }

    public function content(): Content
    {
        return new Content(htmlString: <<<'HTML'
            <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
              <h2 style="color:#4f46e5;margin:0 0 8px;">✅ It works!</h2>
              <p style="color:#334155;font-size:15px;line-height:1.6;">
                If you're reading this, your email configuration is correct and
                transactional emails will be delivered. 🎉
              </p>
              <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
                This is an automated test message.
              </p>
            </div>
        HTML);
    }
}

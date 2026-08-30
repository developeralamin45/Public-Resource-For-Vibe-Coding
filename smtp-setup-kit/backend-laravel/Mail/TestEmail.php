<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * The "does it work at all?" email behind the panel's test button. Kept as its
 * own class (rather than a catalogue event) so it still sends when every event
 * is switched off — which is exactly the state you are debugging in.
 */
class TestEmail extends Mailable
{
    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Test email from ' . config('email_events.brand.name'));
    }

    public function content(): Content
    {
        $brand = config('email_events.brand');

        return new Content(
            view: 'emails.layout',
            with: [
                'brand'    => $brand,
                'bodyHtml' => '<p>This is a test email.</p>'
                    . '<p>If you are reading it, your mail credentials are correct and '
                    . $brand['name'] . ' can reach your inbox.</p>'
                    . '<p>Sent at ' . now()->toDayDateTimeString() . '.</p>',
            ],
        );
    }
}

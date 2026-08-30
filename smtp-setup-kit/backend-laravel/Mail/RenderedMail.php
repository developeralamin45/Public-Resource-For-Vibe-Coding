<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * One Mailable for every catalogue event.
 *
 * The old way — a PHP class + a Blade file per email — means a developer and a
 * deploy for every wording change. Here the admin's subject/body come from the
 * database already rendered, and this class only wraps them in the shared
 * branded layout. Adding an event to the catalogue needs no new PHP at all.
 */
class RenderedMail extends Mailable
{
    public function __construct(
        public string $subjectLine,
        public string $bodyHtml,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.layout',
            with: [
                'bodyHtml' => $this->bodyHtml,
                'brand'    => config('email_events.brand'),
            ],
        );
    }
}

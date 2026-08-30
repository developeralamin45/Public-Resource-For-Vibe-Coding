<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Mail held back by quiet hours, waiting for the window to open.
 *
 * Deliberately a table and not a Laravel queue job: the admin panel can show
 * "3 emails waiting until 8:00am", an operator can cancel them, and the rows
 * survive a queue worker restart. Released by `php artisan email:flush-outbox`
 * on the scheduler.
 */
class EmailOutbox extends Model
{
    protected $table = 'email_outbox';

    protected $fillable = ['event_key', 'to_email', 'subject', 'body', 'send_after', 'attempts', 'last_error'];

    protected $casts = ['send_after' => 'datetime'];
}

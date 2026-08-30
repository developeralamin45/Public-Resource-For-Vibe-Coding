<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Every attempt, including the ones we deliberately did not make.
 *
 * status: sent | failed | skipped | queued
 *
 * `skipped` matters as much as `failed`: when an admin asks "why did the
 * customer not get the shipping email?", the answer is usually "you switched
 * that event off" or "it was a duplicate", and this row says so in plain words
 * instead of leaving a silent gap.
 */
class EmailLog extends Model
{
    protected $fillable = ['type', 'to_email', 'subject', 'status', 'error_message'];
}

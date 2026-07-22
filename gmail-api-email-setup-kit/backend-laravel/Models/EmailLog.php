<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One row per email send attempt — powers the analytics cards and lets you
 * debug failures (error_message holds the transport error).
 */
class EmailLog extends Model
{
    protected $fillable = ['type', 'to_email', 'status', 'error_message'];
}

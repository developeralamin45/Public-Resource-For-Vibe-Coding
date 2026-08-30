<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * The admin's editable copy of one catalogue event.
 *
 * config/email_events.php holds the DEFAULTS; this table holds what the admin
 * actually wants sent. A row is created by EmailTemplateSeeder and from then on
 * it wins — which is what makes "edit the wording" and "switch this off" work
 * without a deploy.
 *
 * `event_key` is the join back to the catalogue. Rows whose key no longer
 * exists in config are shown as orphans in the panel rather than silently kept.
 */
class EmailTemplate extends Model
{
    protected $fillable = ['event_key', 'subject', 'body', 'enabled'];

    protected $casts = ['enabled' => 'boolean'];
}

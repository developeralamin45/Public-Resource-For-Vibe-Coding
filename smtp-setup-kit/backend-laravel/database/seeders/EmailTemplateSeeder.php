<?php

namespace Database\Seeders;

use App\Models\EmailTemplate;
use App\Services\EmailDispatcher;
use Illuminate\Database\Seeder;

/**
 * Copies the active preset's catalogue into `email_templates`, which is what
 * the admin panel edits.
 *
 * SAFE TO RE-RUN. It only INSERTS events that have no row yet — an admin's
 * edited wording and on/off choices are never overwritten by a later deploy.
 * That is the whole reason this is an insert-if-missing and not a sync: the
 * day this seeder clobbers a customer's carefully worded emails is the day
 * they stop trusting the panel.
 *
 * Adding an event to config later? Re-run this seeder to create its row:
 *   php artisan db:seed --class=EmailTemplateSeeder
 */
class EmailTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $catalogue = app(EmailDispatcher::class)->catalogue();
        $created   = 0;

        foreach ($catalogue as $key => $def) {
            $exists = EmailTemplate::where('event_key', $key)->exists();

            if ($exists) {
                continue;
            }

            EmailTemplate::create([
                'event_key' => $key,
                'subject'   => $def['subject'] ?? '',
                'body'      => $def['body'] ?? '',
                'enabled'   => (bool) ($def['default_enabled'] ?? true),
            ]);
            $created++;
        }

        $this->command?->info(
            "Email templates: {$created} added, "
            . (count($catalogue) - $created) . ' already present (left untouched).'
        );
    }
}

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('email_templates')) {
            return;
        }

        Schema::create('email_templates', function (Blueprint $table) {
            $table->id();

            // Joins back to config/email_events.php. Unique: one editable copy
            // per event, so updateOrCreate in the seeder is safe to re-run.
            $table->string('event_key')->unique();

            $table->string('subject');

            // TEXT, not string: a rich HTML body outgrows 255 chars instantly.
            $table->text('body');

            $table->boolean('enabled')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_templates');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('email_outbox')) {
            return;
        }

        Schema::create('email_outbox', function (Blueprint $table) {
            $table->id();
            $table->string('event_key');
            $table->string('to_email');
            $table->string('subject');

            // Already rendered when it was queued: the recipient gets the
            // wording that applied when the event happened, not whatever the
            // admin edited it to overnight.
            $table->text('body');

            $table->timestamp('send_after')->index();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_outbox');
    }
};

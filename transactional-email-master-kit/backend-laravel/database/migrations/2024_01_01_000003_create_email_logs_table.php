<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('email_logs')) {
            // An older install (or the smaller Gmail-only kit) may already have
            // this table without `subject` — add just the missing column.
            if (!Schema::hasColumn('email_logs', 'subject')) {
                Schema::table('email_logs', function (Blueprint $table) {
                    $table->string('subject')->nullable()->after('to_email');
                });
            }
            return;
        }

        Schema::create('email_logs', function (Blueprint $table) {
            $table->id();

            // The catalogue event key ('order.shipped'), or a category for
            // non-catalogue mail ('test', 'manual').
            $table->string('type')->index();

            $table->string('to_email')->index();
            $table->string('subject')->nullable();

            // sent | failed | skipped | queued
            $table->string('status')->default('sent')->index();

            $table->text('error_message')->nullable();
            $table->timestamps();

            // The analytics panel always filters "this month, by status".
            $table->index(['created_at', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_logs');
    }
};

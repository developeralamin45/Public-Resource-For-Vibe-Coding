<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every payment the SmartPay app relayed — the ledger AND the pool: a
 * payment that matched no claim when it arrived waits here (`used` false)
 * for the popup's next poll to claim it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('received_payments', function (Blueprint $table) {
            $table->id();
            $table->string('txn_id', 64)->unique();                       // the idempotency key
            $table->boolean('txn_synthetic')->default(false);
            $table->string('gateway', 12);                                // BKASH | NAGAD | ROCKET | UNKNOWN
            $table->decimal('amount', 10, 2);
            $table->string('sender', 11)->default('');                    // 01XXXXXXXXX, or '' when masked / absent
            $table->string('sender_masked', 20)->default('');
            $table->string('sender_prefix', 6)->default('');
            $table->string('sender_suffix', 6)->default('');
            $table->string('reference', 120)->default('');                // informational only
            $table->unsignedBigInteger('sms_timestamp')->nullable();
            $table->json('tolerance')->nullable();                        // the app's settings at the time
            $table->boolean('used')->default(false);
            $table->foreignId('claim_id')->nullable()->constrained('payment_claims')->nullOnDelete();
            $table->json('reply')->nullable();                            // what the app was told (idempotent replay)
            $table->timestamps();

            $table->index(['used', 'sender']);
            $table->index(['used', 'sender_prefix', 'sender_suffix']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('received_payments');
    }
};

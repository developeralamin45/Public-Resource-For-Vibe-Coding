<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A claim: "I sent ৳X from this number" (or this TrxID), from the popup.
 * Pending until a payment confirms it. If the project already has an
 * orders table, the claim IS the order — add these columns there instead
 * and point the controllers at it (RECIPE.md §4).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_claims', function (Blueprint $table) {
            $table->id();
            $table->string('popup_key', 80)->default('default');          // which checkout (a plan, an order id)
            $table->string('method', 10);                                 // bkash | nagad | rocket | bank
            $table->string('reference', 40);                              // sender number 01XXXXXXXXX, or the TrxID / bank ref
            $table->decimal('amount', 10, 2)->default(0);                 // what they were told to send
            $table->string('lead_name', 120)->default('');
            $table->string('lead_phone', 11)->default('');                // the order form's number (may differ from `reference`)
            $table->string('status', 12)->default('pending');             // pending | approved | hold | verified
            $table->decimal('paid_amount', 10, 2)->nullable();
            $table->string('gateway', 12)->nullable();                    // BKASH | NAGAD | ROCKET
            $table->string('txn_id', 64)->nullable();
            $table->boolean('underpaid')->default(false);
            $table->string('note', 200)->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->unsignedSmallInteger('check_hour')->nullable();       // the popup's poll: hour bucket + count
            $table->unsignedSmallInteger('check_count')->default(0);
            $table->nullableMorphs('payable');                            // optional: the order / user this claim is for
            $table->timestamps();

            $table->index(['status', 'method']);
            $table->index(['popup_key', 'method', 'reference']);
            $table->index('reference');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_claims');
    }
};

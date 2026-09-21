<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The order form, while they type: the only record of a visitor who leaves
 * without paying. One row per phone; the furthest stage wins.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_leads', function (Blueprint $table) {
            $table->id();
            $table->string('phone', 11)->unique();
            $table->string('name', 120)->default('');
            $table->string('stage', 10)->default('typed');                // typed | checkout | paid
            $table->string('method', 10)->nullable();
            $table->decimal('amount', 10, 2)->nullable();
            $table->string('reference', 40)->nullable();                  // at `paid`: the sender number / TrxID
            $table->timestamp('typed_at')->nullable();
            $table->timestamp('checkout_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('whatsapp_at')->nullable();
            $table->unsignedInteger('whatsapp_count')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_leads');
    }
};

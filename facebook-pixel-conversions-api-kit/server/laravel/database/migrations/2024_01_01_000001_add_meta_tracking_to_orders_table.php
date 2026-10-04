<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two columns on whatever row a sale hangs from. RENAME THE TABLE to the
 * project's own: `orders` for a shop, `subscriptions` / `payments` /
 * `tenants` for a SaaS, `leads` if the sale starts as one.
 *
 *   meta_attribution       fbp / fbc / ip / user agent / page, captured while
 *                          the buyer's browser was there. Under on_confirm it
 *                          is the only link from the Purchase to the ad click.
 *   meta_purchase_sent_at  the stamp that makes a Purchase happen once.
 *
 * If a lead or a user exists before the order does (a SaaS trial, a lead
 * form), give that table `meta_attribution` too and copy it forward.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->json('meta_attribution')->nullable();
            $table->timestamp('meta_purchase_sent_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['meta_attribution', 'meta_purchase_sent_at']);
        });
    }
};

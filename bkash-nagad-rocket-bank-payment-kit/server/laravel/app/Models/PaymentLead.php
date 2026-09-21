<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentLead extends Model
{
    public const STAGES = ['typed', 'checkout', 'paid'];

    protected $guarded = [];

    protected $casts = [
        'amount' => 'float',
        'typed_at' => 'datetime',
        'checkout_at' => 'datetime',
        'paid_at' => 'datetime',
        'whatsapp_at' => 'datetime',
    ];
}

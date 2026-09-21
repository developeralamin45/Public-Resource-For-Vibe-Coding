<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentClaim extends Model
{
    protected $guarded = [];

    protected $casts = [
        'amount' => 'float',
        'paid_amount' => 'float',
        'underpaid' => 'bool',
        'verified_at' => 'datetime',
    ];

    public function payable()
    {
        return $this->morphTo();
    }

    public function isSettled(): bool
    {
        return in_array($this->status, ['approved', 'verified'], true);
    }
}

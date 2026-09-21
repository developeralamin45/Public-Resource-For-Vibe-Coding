<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReceivedPayment extends Model
{
    protected $guarded = [];

    protected $casts = [
        'amount' => 'float',
        'txn_synthetic' => 'bool',
        'used' => 'bool',
        'tolerance' => 'array',
        'reply' => 'array',
    ];

    /** The shape SmartPayRules reads. */
    public function toRule(): array
    {
        return [
            'amount' => (float) $this->amount,
            'txn_id' => $this->txn_id,
            'txn_synthetic' => (bool) $this->txn_synthetic,
            'gateway' => $this->gateway,
            'sender' => $this->sender ?? '',
            'sender_prefix' => $this->sender_prefix ?? '',
            'sender_suffix' => $this->sender_suffix ?? '',
            'tolerance' => $this->tolerance ?: null,
        ];
    }
}

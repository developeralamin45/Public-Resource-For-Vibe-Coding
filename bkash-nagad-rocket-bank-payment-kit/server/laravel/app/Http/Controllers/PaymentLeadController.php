<?php

namespace App\Http\Controllers;

use App\Models\PaymentLead;
use App\Support\SmartPayRules as R;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/lead — the order form, while they type. Fired on every pause,
 * so a half-typed number is the normal case: silent no-op, not an error.
 */
class PaymentLeadController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $phone = R::normalizeBdPhone((string) $request->input('phone', ''));
        if (!R::isValidBdPhone($phone)) return response()->json(['ok' => false]);
        $stage = in_array($request->input('stage'), PaymentLead::STAGES, true) ? $request->input('stage') : 'typed';
        self::advance($phone, $stage, [
            'name' => mb_substr(trim((string) $request->input('name', '')), 0, 120),
            'method' => $request->input('method'),
            'amount' => $request->input('amount'),
            'reference' => $request->input('reference'),
            'whatsapp' => (bool) $request->input('whatsapp'),
        ]);
        return response()->json(['ok' => true]);
    }

    /** Furthest stage wins, never the latest: a `typed` after `paid` must not demote. */
    public static function advance(string $phone, string $incoming, array $data = []): PaymentLead
    {
        $lead = PaymentLead::firstOrNew(['phone' => $phone]);
        $rank = fn (?string $s) => array_search($s, PaymentLead::STAGES, true);
        $stage = $rank($lead->stage) > $rank($incoming) ? $lead->stage : $incoming;
        $patch = ['stage' => $stage];
        if (($data['name'] ?? '') !== '') $patch['name'] = $data['name'];
        foreach (['method', 'amount', 'reference'] as $k) if (!empty($data[$k])) $patch[$k] = $data[$k];
        if ($stage !== $lead->stage) $patch["{$stage}_at"] = now();
        if (!empty($data['whatsapp'])) { $patch['whatsapp_at'] = now(); $patch['whatsapp_count'] = (int) $lead->whatsapp_count + 1; }
        $lead->fill($patch)->save();
        return $lead;
    }
}

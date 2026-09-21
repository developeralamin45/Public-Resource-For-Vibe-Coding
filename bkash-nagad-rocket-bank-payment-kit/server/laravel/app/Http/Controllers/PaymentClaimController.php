<?php

namespace App\Http\Controllers;

use App\Models\PaymentClaim;
use App\Models\PaymentLead;
use App\Models\ReceivedPayment;
use App\Support\SmartPayRules as R;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The popup's two calls: the claim, and "did the money arrive?".
 *
 * Both are unauthenticated (an anonymous visitor). The poll is bounded per
 * claim per hour, and a lookup needs a full number or TrxID that recently
 * paid, so it cannot be used to fish for payments.
 */
class PaymentClaimController extends Controller
{
    /** POST /api/payment-claim — the claim, pending until money confirms it. */
    public function store(Request $request): JsonResponse
    {
        $parsed = R::parseClaim($request->all());
        if (!$parsed['ok']) return response()->json(['error' => $parsed['error']], 400);
        $c = $parsed['claim'];

        // One open claim per reference + checkout: a resubmit edits, it does not duplicate.
        $claim = PaymentClaim::query()
            ->where('status', 'pending')
            ->where('popup_key', $c['popup_key'])->where('method', $c['method'])->where('reference', $c['reference'])
            ->first() ?? new PaymentClaim(['status' => 'pending']);
        $claim->fill($c)->save();

        // The lead says they paid. The call sheet wants that, and the reference.
        if ($c['lead_phone'] !== '') {
            PaymentLeadController::advance($c['lead_phone'], 'paid', ['name' => $c['lead_name'], 'method' => $c['method'], 'amount' => $c['amount'], 'reference' => $c['reference']]);
        }

        // ── Your seam: attach the claim to the thing it pays for ──
        // e.g. $order = Order::find($c['popup_key']); $claim->payable()->associate($order)->save();

        return response()->json(['ok' => true, 'claimId' => $claim->id]);
    }

    /** POST /api/payment-claim/check — polled every 8 s for two minutes. */
    public function check(Request $request): JsonResponse
    {
        $parsed = R::parseClaim($request->all());
        if (!$parsed['ok']) return response()->json(['error' => $parsed['error']], 400);
        $c = $parsed['claim'];

        $claim = PaymentClaim::query()
            ->where('popup_key', $c['popup_key'])->where('method', $c['method'])->where('reference', $c['reference'])
            ->latest('id')->first();

        // Sixty looks an hour per claim; beyond that the popup shows "being checked".
        if ($claim) {
            $hour = (int) floor(time() / 3600) % 65536;
            $count = $claim->check_hour === $hour ? (int) $claim->check_count : 0;
            if ($count >= R::CLAIM_CHECKS_PER_HOUR) return response()->json(['found' => false, 'throttled' => true]);
            $claim->forceFill(['check_hour' => $hour, 'check_count' => $count + 1])->save();

            // The SMS beat the typing: the webhook already settled it.
            if ($claim->isSettled()) {
                return response()->json(['found' => true, 'amount' => (float) $claim->paid_amount, 'gateway' => $claim->gateway, 'underpaid' => (bool) $claim->underpaid]);
            }
        }

        // The typing beat the SMS: is it waiting in the pool?
        $fit = DB::transaction(function () use ($c, $claim) {
            $candidates = ReceivedPayment::query()->where('used', false)->lockForUpdate()
                ->when(R::isTrxMethod($c['method']),
                    fn ($q) => $q->where('txn_synthetic', false),
                    fn ($q) => $q->where(fn ($w) => $w->where('sender', '!=', '')->orWhere('sender_prefix', '!=', '')))
                ->latest('id')->limit(200)->get();
            foreach ($candidates as $p) {
                if (!R::paymentMatchesClaim($p->toRule(), ['method' => $c['method'], 'reference' => $c['reference']])) continue;
                $judged = R::judgeAmount((float) $c['amount'], (float) $p->amount, $p->tolerance ?: null);
                $p->forceFill(['used' => true, 'claim_id' => $claim?->id])->save();
                $claim?->forceFill([
                    'status' => 'approved', 'paid_amount' => $p->amount, 'gateway' => $p->gateway, 'txn_id' => $p->txn_id,
                    'underpaid' => $judged['action'] === 'hold_short', 'note' => $judged['note'], 'verified_at' => now(),
                ])->save();
                return ['amount' => (float) $p->amount, 'gateway' => $p->gateway, 'underpaid' => $judged['action'] === 'hold_short'];
            }
            return null;
        });
        if ($fit) {
            // ── Your seam: the money is confirmed — activate / mark paid / fire Purchase server-side ──
            // event(new PaymentConfirmed($claim));
            return response()->json(['found' => true] + $fit);
        }

        $last = ReceivedPayment::query()->max('created_at');
        $verifier = R::verifierState((bool) config('smartpay.enabled', true), $last ? new \DateTimeImmutable($last) : null);
        return response()->json(['found' => false] + ($verifier ? ['verifier' => $verifier] : []));
    }
}

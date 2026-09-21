<?php

namespace App\Http\Controllers;

use App\Models\PaymentClaim;
use App\Models\ReceivedPayment;
use App\Support\SmartPayRules as R;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * POST /api/smartpay/payment — the SmartPay Auto Verify app on the
 * receiving phone posts every payment SMS here, seconds after the money
 * lands (server/CONTRACT.md §4, and the app's own guide §3).
 *
 * The URL must be the FINAL one — the app does not follow redirects (a
 * POST redirected becomes an empty GET, and the payment is lost). HTTPS
 * only. Exclude this route from CSRF.
 */
class SmartPayWebhookController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        if (!R::authorized($request->header('Authorization'), (string) config('smartpay.secret'))) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }
        $parsed = R::parseWebhook($request->all());
        if (!$parsed['ok']) return response()->json(['error' => $parsed['error']], $parsed['status']);
        if (!empty($parsed['test'])) return response()->json(['status' => 'success', 'message' => 'Test connection successful. Webhook is active!']);
        $p = $parsed['payment'];
        $site = (string) config('smartpay.site_name');

        // Idempotency: the same TxnID again gets the same answer, never a second approval.
        if ($seen = ReceivedPayment::query()->where('txn_id', $p['txn_id'])->first()) {
            if ($seen->reply && $seen->used) return response()->json($seen->reply);
            // Pooled earlier and still unclaimed: fall through, a claim may have arrived since.
        }

        $reply = DB::transaction(function () use ($p, $site, $seen) {
            $open = PaymentClaim::query()->where('status', 'pending')->lockForUpdate()->latest('id')->limit(300)->get();
            $claim = R::findClaimForPayment($p, $open);
            $row = $seen ?? new ReceivedPayment();
            $row->fill([
                'txn_id' => $p['txn_id'], 'txn_synthetic' => $p['txn_synthetic'], 'gateway' => $p['gateway'], 'amount' => $p['amount'],
                'sender' => $p['sender'], 'sender_masked' => $p['sender_masked'], 'sender_prefix' => $p['sender_prefix'], 'sender_suffix' => $p['sender_suffix'],
                'reference' => $p['reference'], 'sms_timestamp' => $p['timestamp'], 'tolerance' => $p['tolerance'],
            ]);
            if (!$claim) {
                // Nobody has claimed it yet: keep it, the popup's next poll will find it.
                $row->fill(['used' => false])->save();
                return R::webhookReply($site, null);
            }
            $judged = R::judgeAmount((float) $claim->amount, (float) $p['amount'], $p['tolerance']);
            $claim->forceFill([
                'status' => $judged['action'] === 'approved' ? 'approved' : 'hold',
                'paid_amount' => $p['amount'], 'gateway' => $p['gateway'], 'txn_id' => $p['txn_id'],
                'underpaid' => $judged['action'] === 'hold_short', 'note' => $judged['note'], 'verified_at' => now(),
            ])->save();
            $reply = R::webhookReply($site, $claim, $judged['action'], $judged['note'], (float) $claim->amount);
            $row->fill(['used' => true, 'claim_id' => $claim->id, 'reply' => $reply])->save();

            // ── Your seam: the money is confirmed for $claim ──
            // if ($judged['action'] === 'approved') event(new PaymentConfirmed($claim));   // activate the account, mark the order paid, fire Purchase to Meta from HERE
            // else notify an admin: hold_short / hold_excess need a human.

            return $reply;
        });

        return response()->json($reply);
    }
}

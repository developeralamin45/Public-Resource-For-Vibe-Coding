<?php

/*
| The three call sites. Not a file to copy — the shape to reproduce inside
| the project's own order / payment / approval code.
|
| Every project has call site 1. Which of 2 and 3 exist depends on what the
| project is — and purchaseDue() makes it safe to wire all of them: it is
| true at exactly one moment per order, once.
*/

use App\Models\Order;
use App\Support\MetaCapi;
use Illuminate\Http\Request;

// Adapters: the project's model → the plain arrays MetaCapi takes.
function metaOrder(Order $order): array
{
    return [
        'ref' => $order->order_number,
        'value' => (float) $order->total,
        'currency' => 'BDT',
        'method' => $order->payment_method,
        'items' => $order->items->map(fn ($i) => ['id' => $i->product_id, 'quantity' => $i->quantity, 'price' => $i->unit_price])->all(),
    ];
}

function metaPerson(Order $order): array
{
    return [
        'name' => $order->customer_name,
        'phone' => $order->customer_phone,
        'email' => $order->customer_email,
        'city' => $order->city,
        'country' => 'bd',
        'external_id' => $order->user_id,
    ];
}

/** The single gate every moment goes through. Never throws. */
function metaReach(Order $order, string $moment): void
{
    try {
        $policy = MetaCapi::policyFor($order->payment_method);
        if (! MetaCapi::purchaseDue($policy, $moment, $order->meta_purchase_sent_at !== null)) {
            return;
        }
        $event = MetaCapi::purchaseEvent(metaOrder($order), metaPerson($order), $order->meta_attribution);
        if (MetaCapi::send([$event], 'order '.$order->order_number)) {
            // Stamped only once Meta has accepted it.
            $order->forceFill(['meta_purchase_sent_at' => now()])->save();
        }
    } catch (\Throwable $e) {
        report($e);
    }
}

// ── 1. The order is placed (checkout controller / PlaceOrder action) ────
//
//    The browser posts MetaPixel.attribution() with the form:
//        body: JSON.stringify({ ...form, meta: MetaPixel.attribution() })
function placeOrder(Request $request): Order
{
    $order = Order::create([/* … the project's own fields … */]);
    $order->forceFill(['meta_attribution' => MetaCapi::readAttribution($request->input('meta'), $request)])->save();

    metaReach($order, 'order_placed');          // on_order (COD): the Purchase goes out here

    // on_payment / on_confirm: this moment is a step, not a sale. The
    // thank-you page fires it as AddPaymentInfo (below), and the relay
    // forwards that same event — nothing more to send from here.

    return $order;
}

// ── 2. The gateway says paid (IPN / server-to-server callback) ──────────
//
//    AFTER the project has verified the callback with the gateway
//    (signature / validation API), never on the browser's return URL alone.
function gatewayCallbackVerified(Order $order): void
{
    $order->update(['status' => 'paid']);
    metaReach($order, 'payment_verified');      // on_payment: the Purchase goes out here
}

// ── 3. A human — or the SMS matcher — confirms ──────────────────────────
//
//    The admin "approve payment" button, the CRM status sync, the
//    auto-verify webhook that matched the money. Hook the STATUS
//    TRANSITION, not the button, so every door leads here.
function orderConfirmed(Order $order): void
{
    $order->update(['status' => 'confirmed']);
    metaReach($order, 'confirmed');             // on_confirm: the Purchase goes out here
}

// ── The thank-you / success page ────────────────────────────────────────
//
//    Hand the page the Purchase id only where the browser may fire it AND
//    the server already considers the sale made:
//
//    @php
//        $policy = \App\Support\MetaCapi::policyFor($order->payment_method);
//        $fire = \App\Support\MetaCapi::browserMayFirePurchase($policy) && $order->meta_purchase_sent_at;
//    @endphp
//    @push('pixel')
//        @if($fire)
//            MetaPixel.purchase(@json(MetaCapi::orderCustomData(metaOrder($order))), @json(MetaCapi::purchaseEventId($order->order_number)), { policy: @json($policy) });
//        @else
//            MetaPixel.addPaymentInfo(@json(MetaCapi::orderCustomData(metaOrder($order), false)),
//                { eventId: @json(MetaCapi::eventIdFor('AddPaymentInfo', $order->order_number)) });
//        @endif
//    @endpush

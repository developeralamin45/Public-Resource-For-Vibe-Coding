<?php

namespace Tests\Feature;

use App\Support\MetaCapi;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The tests worth porting into the project — rewritten against ITS order
 * flow (replace the plain arrays with real orders going through the real
 * controller / status change). The names say what must stay true.
 */
class MetaPurchaseTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['meta.pixel_id' => '111', 'meta.access_token' => 'SECRET', 'meta.test_event_code' => '']);
        Http::fake(['graph.facebook.com/*' => Http::response(['events_received' => 1])]);
    }

    private function order(array $over = []): array
    {
        return $over + ['ref' => 'A-1001', 'value' => 1900, 'method' => 'cod', 'items' => [['id' => 7, 'quantity' => 2, 'price' => 950]]];
    }

    public function test_cod_is_a_purchase_the_moment_it_is_placed(): void
    {
        $this->assertTrue(MetaCapi::purchaseDue('on_order', 'order_placed'));
    }

    public function test_money_sent_by_hand_is_not_a_purchase_until_confirmed(): void
    {
        $this->assertFalse(MetaCapi::purchaseDue('on_confirm', 'order_placed'));
        $this->assertTrue(MetaCapi::purchaseDue('on_confirm', 'confirmed'));
    }

    public function test_the_same_money_is_never_reported_twice(): void
    {
        $this->assertFalse(MetaCapi::purchaseDue('on_confirm', 'confirmed', alreadySent: true));
    }

    public function test_the_token_travels_in_the_body_not_the_url(): void
    {
        MetaCapi::send([MetaCapi::purchaseEvent($this->order(), ['phone' => '01712345678'])]);

        Http::assertSent(fn ($request) => ! str_contains($request->url(), 'SECRET')
            && $request['access_token'] === 'SECRET'
            && $request['data'][0]['event_name'] === 'Purchase'
            && $request['data'][0]['event_id'] === 'purchase.A-1001'
            && $request['data'][0]['custom_data']['value'] === 1900.0
            && $request['data'][0]['user_data']['ph'] === [hash('sha256', '8801712345678')]);
    }

    public function test_a_facebook_outage_never_breaks_an_order(): void
    {
        Http::fake(['graph.facebook.com/*' => fn () => throw new \RuntimeException('down')]);

        $this->assertFalse(MetaCapi::send([MetaCapi::purchaseEvent($this->order())]));
    }

    public function test_nothing_is_sent_before_the_owner_has_pasted_the_token(): void
    {
        config(['meta.access_token' => '']);

        $this->assertFalse(MetaCapi::send([MetaCapi::purchaseEvent($this->order())]));
        Http::assertNothingSent();
    }

    public function test_the_relay_refuses_a_purchase(): void
    {
        $this->postJson('/api/meta/event', ['event_name' => 'Purchase', 'event_id' => 'forged', 'custom_data' => ['value' => 99999]])
            ->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_the_relay_forwards_a_funnel_event_with_the_same_id(): void
    {
        $this->postJson('/api/meta/event', ['event_name' => 'AddToCart', 'event_id' => 'ev-1', 'event_source_url' => 'https://shop.test/p/7'])
            ->assertOk();

        Http::assertSent(fn ($request) => $request['data'][0]['event_id'] === 'ev-1'
            && $request['data'][0]['action_source'] === 'website');
    }
}

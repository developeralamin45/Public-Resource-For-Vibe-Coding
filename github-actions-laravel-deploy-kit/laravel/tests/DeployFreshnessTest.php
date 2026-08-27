<?php

namespace Tests\Feature;

use App\Support\BuildVersion;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * Proves the "a deploy is visible immediately" half of the kit still works.
 *
 * Swap '/' below for any always-200 HTML route in your app if the homepage
 * redirects (e.g. '/login'). Nothing else here is project-specific.
 */
class DeployFreshnessTest extends TestCase
{
    private const HTML_ROUTE = '/';

    public function test_html_is_revalidated_rather_than_reused_blindly(): void
    {
        $response = $this->get(self::HTML_ROUTE)->assertOk();

        // "no-cache" = store it, but always ask the server first. That is what
        // makes a deploy show up on the very next page view.
        $this->assertStringContainsString('no-cache', (string) $response->headers->get('Cache-Control'));
        $this->assertNotNull($response->headers->get('ETag'));
    }

    public function test_an_unchanged_page_costs_a_304_not_a_download(): void
    {
        $etag = $this->get(self::HTML_ROUTE)->assertOk()->headers->get('ETag');

        $this->withHeaders(['If-None-Match' => $etag])
            ->get(self::HTML_ROUTE)
            ->assertStatus(304)
            ->assertNoContent(304);
    }

    public function test_a_changed_page_is_sent_in_full(): void
    {
        $this->withHeaders(['If-None-Match' => '"stale-etag"'])
            ->get(self::HTML_ROUTE)
            ->assertOk();
    }

    public function test_the_build_fingerprint_is_stable_between_builds(): void
    {
        Cache::flush();
        $first = BuildVersion::current();

        $this->assertNotSame('', $first);
        $this->assertSame($first, BuildVersion::current());

        // A deploy runs `cache:clear`; the value only moves when the manifest does.
        Cache::flush();
        $this->assertSame($first, BuildVersion::current());
    }
}

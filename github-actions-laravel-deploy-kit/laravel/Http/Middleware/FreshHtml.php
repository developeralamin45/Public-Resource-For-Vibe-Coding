<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keeps HTML out of long-lived caches so a deploy is visible immediately.
 *
 * Built assets are content-hashed by Vite (app-Bh8eslq-.js), so they can be
 * cached forever and a new build simply has a new name. The HTML that *points*
 * at them is the weak link: cache that, and the browser keeps asking for
 * yesterday's filenames long after the deploy — the classic "I changed the
 * button but nothing happened" bug.
 *
 * `no-cache` does not mean "never store". It means "store it, but check with
 * the server before reusing it". Paired with an ETag, an unchanged page costs
 * a 304 with an empty body instead of a full re-download — so this is fresh
 * *and* cheap on a slow mobile connection.
 */
class FreshHtml
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $this->isCacheableHtml($request, $response)) {
            return $response;
        }

        $response->headers->set('Cache-Control', 'no-cache, private, must-revalidate');

        // Weak validator over the rendered body: identical page → 304.
        $content = $response->getContent();

        if ($content !== false && $content !== '') {
            $response->setEtag(md5($content), true);
            $response->isNotModified($request);
        }

        return $response;
    }

    private function isCacheableHtml(Request $request, Response $response): bool
    {
        if (! $request->isMethodCacheable() || $response->getStatusCode() !== 200) {
            return false;
        }

        // Streamed/binary responses (invoices, downloads) have no body to hash.
        if (! $response instanceof \Illuminate\Http\Response) {
            return false;
        }

        return str_contains((string) $response->headers->get('Content-Type'), 'text/html');
    }
}

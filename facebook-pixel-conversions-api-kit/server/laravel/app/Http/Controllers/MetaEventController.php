<?php

namespace App\Http\Controllers;

use App\Support\MetaCapi;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/meta/event — the relay. The browser fires a funnel event with
 * fbq and posts the same event here with the same event_id; this forwards it
 * to the Conversions API with the ip and user agent only the server can see.
 * Meta counts the pair once.
 *
 * Public by nature (visitors are not logged in), so it is narrow on purpose:
 * standard events only, never Purchase — under every policy a Purchase is
 * sent by the code that knows the order. Mount it behind a throttle.
 */
class MetaEventController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $event = MetaCapi::relayedEvent($request->all(), $request);

        if ($event === null) {
            return response()->json(['status' => 'refused'], 422);
        }

        // After the response where the host allows it — the visitor's page
        // should never wait on Facebook.
        dispatch(fn () => MetaCapi::send([$event], 'relay'))->afterResponse();

        return response()->json(['status' => 'ok']);
    }
}

{{-- Meta pixel for a server-rendered site. Include once, in the PUBLIC
     layout only (never the admin panel), just before </head> or </body>:

         @include('partials.meta-pixel')

     Pages add their own events to the `pixel` stack:

         @push('pixel')
             MetaPixel.viewContent({ content_ids: [@json((string) $product->id)], content_type: 'product',
                                     content_name: @json($product->name), value: @json((float) $product->price), currency: 'BDT' });
         @endpush

     Nothing renders until a pixel id is configured. Purchase is never
     written here by hand: under on_confirm the server sends it; under
     on_order / on_payment the thank-you page calls MetaPixel.purchase()
     with the id the server issued (wiring.example.php).

     meta-pixel.js queues every event at once and defers only the download
     of fbevents.js until the page is on screen, so the pixel never competes
     with the first paint. Publish browser/meta-pixel.js to public/js/. --}}
@php
    $metaPixelId = \App\Support\MetaCapi::credentials()['pixel_id'];
@endphp
@if($metaPixelId !== '')
    <script src="{{ asset('js/meta-pixel.js') }}"></script>
    <script>
        MetaPixel.init({
            pixelId: @json($metaPixelId),
            // The site-wide default; a page that knows the order's payment
            // method decides per order (see the thank-you page wiring).
            purchasePolicy: @json(\App\Support\MetaCapi::policyFor()),
            relayUrl: @json(url('/api/meta/event')),
            phoneCountryCode: @json((string) config('meta.phone_country_code', '880')),
        });
        @stack('pixel')
    </script>
    <noscript><img height="1" width="1" style="display:none" alt=""
        src="https://www.facebook.com/tr?id={{ urlencode($metaPixelId) }}&ev=PageView&noscript=1"></noscript>
@endif

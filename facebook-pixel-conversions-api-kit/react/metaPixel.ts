// The typed handle for bundled projects (Vite, webpack, Next client code).
//
// meta-pixel.js is a plain script that puts `MetaPixel` on window; importing
// it for its side effect is all a bundler needs. Copy both files next to
// each other (or fix the path) and import from here everywhere:
//
//   import { MetaPixel } from '@/lib/metaPixel';
//   MetaPixel.addToCart({ content_ids: [String(product.id)], content_type: 'product' });

import '../browser/meta-pixel.js';
import type { MetaPixelApi } from '../browser/meta-pixel';

export type { Attribution, EventParams, MetaPixelOptions, PurchasePolicy, StandardEvent, TrackOptions } from '../browser/meta-pixel';

export const MetaPixel: MetaPixelApi = window.MetaPixel;

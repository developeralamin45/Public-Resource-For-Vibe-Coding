// PageView on every route change. A single-page app loads once, so the
// pixel's own automatic PageView would count one page per visit.
//
// Mount it ONCE, inside the router, on the PUBLIC part of the site only:
//
//   function PublicLayout() {
//       const { pathname, search } = useLocation();   // react-router
//       useMetaPageView(pathname + search);
//       return <Outlet />;
//   }
//
// Next.js (app router): usePathname() + useSearchParams() in a client component.
//
// MetaPixel.init() must already have run (main.tsx, with autoPageView left
// on) — pageView() ignores a path it has already counted, so the first
// render does not double up with init's own PageView.

import { useEffect } from 'react';
import { MetaPixel } from './metaPixel';

export function useMetaPageView(path: string): void {
    useEffect(() => {
        MetaPixel.pageView();
    }, [path]);
}

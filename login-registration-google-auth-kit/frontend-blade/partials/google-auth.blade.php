{{-- "Continue with Google" — the button, its error line and the "or with email"
     divider, as one block that is shown or hidden whole.

     Google Identity Services (token flow): a popup, an access token, and a POST
     to /auth/google, which verifies the token with Google and answers with
     where to go — the dashboard for a known address, the one-field last step
     for one the site has not seen.

     The client id comes from Admin → Site settings → Google login, falling back
     to GOOGLE_CLIENT_ID in .env. The caller includes this only when
     GoogleAuth::offeredTo() says the button can work for this visitor. --}}
@php($googleClientId = \App\Support\GoogleAuth::clientId())
@php($activeTab = $activeTab ?? 'login')

<div id="google-block">
<button type="button" id="google-signin"
        class="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-semibold text-sm sm:text-base text-fg bg-ink-850 border border-ink-700 hover:border-ink-600 hover:bg-ink-800 transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed">
    <svg class="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
    <span id="google-signin-label">Continue with Google</span>
</button>
<p id="google-error" class="mt-2 text-center text-sm text-red-500" hidden></p>

{{-- Divider --}}
<div class="my-6 flex items-center gap-3" aria-hidden="true">
    <div class="flex-1 h-px bg-ink-700"></div>
    <span id="email-divider-label" class="text-xs font-medium text-fg-faint whitespace-nowrap">or {{ $activeTab === 'register' ? 'register' : 'sign in' }} with email</span>
    <div class="flex-1 h-px bg-ink-700"></div>
</div>
</div>

@push('scripts')
<script>
(function () {
    var btn = document.getElementById('google-signin');
    if (!btn) return;

    // The server already left this block out for an embedded browser. This is
    // the same check again for the case the server never saw: a page served
    // from a full-page cache or a CDN was rendered for somebody else's
    // browser. Same list, rendered from the same constant.
    var EMBEDDED = @json(\App\Support\GoogleAuth::EMBEDDED_BROWSER_MARKERS);
    var ua = (navigator.userAgent || '').toLowerCase();
    for (var i = 0; i < EMBEDDED.length; i++) {
        if (ua.indexOf(EMBEDDED[i].toLowerCase()) !== -1) {
            document.getElementById('google-block').hidden = true;
            return;
        }
    }

    var label = document.getElementById('google-signin-label');
    var errorEl = document.getElementById('google-error');
    var CLIENT_ID = @json($googleClientId);
    var GIS_SRC = 'https://accounts.google.com/gsi/client';
    var scriptPromise = null;
    var busy = false;

    function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }

    function loadGis() {
        if (scriptPromise) return scriptPromise;
        scriptPromise = new Promise(function (resolve, reject) {
            if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
            var s = document.createElement('script');
            s.src = GIS_SRC; s.async = true; s.defer = true;
            s.onload = resolve;
            s.onerror = function () {
                // Forget the failure, or one dropped request would break the
                // button until the page is reloaded.
                scriptPromise = null;
                s.remove();
                reject(new Error('Could not load the Google script'));
            };
            document.head.appendChild(s);
        });
        return scriptPromise;
    }

    function setBusy(state) {
        busy = state; btn.disabled = state;
        label.textContent = state ? 'Please wait…' : 'Continue with Google';
    }

    async function postToken(accessToken) {
        var res;
        try {
            res = await fetch(@json(route('auth.google')), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
                },
                body: JSON.stringify({ access_token: accessToken }),
            });
        } catch (e) {
            // Offline, or the request never left: the button must come back.
            setBusy(false);
            showError('No connection. Check your internet and try again.');
            return;
        }
        var data = await res.json().catch(function () { return {}; });
        if (res.ok && data.redirect) {
            window.location.href = data.redirect;
        } else {
            setBusy(false);
            showError(res.status === 419
                ? 'This page has been open too long. Refresh it and try again.'
                : (data.message || 'Sign-in could not be completed. Please try again.'));
        }
    }

    // Fetch Google's script before it is needed. A popup may only be opened
    // while the browser still counts the tap as "just happened"; a click that
    // first has to download a script can outlive that on a slow connection,
    // and the popup is then blocked with nothing on screen to say why.
    function warmUp() { loadGis().catch(function () {}); }
    if ('requestIdleCallback' in window) requestIdleCallback(warmUp, { timeout: 3000 });
    else setTimeout(warmUp, 1200);
    btn.addEventListener('pointerdown', warmUp, { passive: true });

    btn.addEventListener('click', async function () {
        if (busy) return;
        errorEl.hidden = true;
        if (!CLIENT_ID) { showError('Google login is not configured yet.'); return; }
        setBusy(true);
        try {
            await loadGis();
            var client = window.google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: 'openid email profile',
                callback: function (resp) {
                    if (resp && resp.access_token) postToken(resp.access_token);
                    else { setBusy(false); showError('No token received from Google.'); }
                },
                error_callback: function (err) {
                    setBusy(false);
                    // Closing the popup is a decision, not an error: say nothing.
                    if (err && err.type === 'popup_closed') return;
                    showError(err && err.type === 'popup_failed_to_open'
                        ? 'The Google window was blocked. Allow pop-ups for this site and try again.'
                        : 'Google sign-in was cancelled.');
                },
            });
            client.requestAccessToken();
        } catch (e) {
            setBusy(false);
            showError(e.message || 'Google sign-in failed.');
        }
    });
})();
</script>
@endpush

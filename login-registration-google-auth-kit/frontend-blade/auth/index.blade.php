@extends('layouts.auth')

@php($activeTab = $activeTab ?? 'login')

@section('title', $activeTab === 'register' ? 'Register' : 'Sign in')

@section('content')

    {{-- Tabs --}}
    <div class="relative flex gap-1 p-1.5 bg-ink-850 rounded-2xl mb-6" role="tablist">
        {{-- Sliding pill indicator --}}
        <span id="tab-indicator" class="absolute top-1.5 bottom-1.5 rounded-xl bg-ink-900 shadow-sm transition-all duration-300 ease-[cubic-bezier(.4,0,.2,1)]"></span>
        <a href="{{ route('login') }}" data-tab="login"
           class="tab-btn relative z-10 flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm sm:text-base font-bold transition-colors duration-300 {{ $activeTab === 'login' ? 'text-brand-500' : 'text-fg-subtle' }}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
            Sign in
        </a>
        <a href="{{ route('register') }}" data-tab="register"
           class="tab-btn relative z-10 flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm sm:text-base font-bold transition-colors duration-300 {{ $activeTab === 'register' ? 'text-brand-500' : 'text-fg-subtle' }}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6"/></svg>
            Register
        </a>
    </div>

    {{-- Continue with Google (on top). The button and its "or with email"
         divider hang on one condition, and both live inside the partial so
         they come and go together: a divider above nothing reads as a broken
         page. They are left out when no client id is configured (the button
         could only ever show an error) and inside Facebook's, Instagram's and
         other apps' embedded browsers (Google refuses to sign anyone in from
         one, so there the button could only ever fail). --}}
    @if (\App\Support\GoogleAuth::offeredTo(request()->userAgent()))
        @include('partials.google-auth', ['activeTab' => $activeTab])
    @endif

    {{-- ═══ Login form ═══ --}}
    <form method="POST" action="{{ route('login') }}" data-panel="login" class="space-y-4 sm:space-y-5 panel-form {{ $activeTab !== 'login' ? 'panel-hidden' : '' }}">
        @csrf
        <x-float-input id="login-email" name="email" type="email" label="Email address" :value="old('email')" required autocomplete="username" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
        </x-float-input>

        <x-float-input id="login-password" name="password" type="password" label="Password" required autocomplete="current-password" data-password>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path stroke-linecap="round" d="M8 11V7a4 4 0 118 0v4"/></svg>
            <x-slot:right>
                <button type="button" class="toggle-password text-fg-faint hover:text-brand-500 transition p-1" tabindex="-1" aria-label="Show password">
                    <svg class="eye-open w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg class="eye-off w-4 h-4 hidden" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 5.2A9.5 9.5 0 0112 5c6 0 9.5 7 9.5 7a15 15 0 01-3.3 3.9M6.3 6.3A15 15 0 002.5 12S6 19 12 19a9.3 9.3 0 004-.9"/></svg>
                </button>
            </x-slot:right>
        </x-float-input>

        <div class="flex justify-end -mt-1">
            <a href="{{ route('password.request') }}" class="text-xs font-semibold text-accent-500 hover:text-accent-400">Forgot your password?</a>
        </div>

        <button type="submit"
                class="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm sm:text-base text-white bg-gradient-to-r from-accent-400 to-accent-600 hover:from-accent-500 hover:to-accent-700 shadow-lg shadow-accent-600/25 transition active:scale-[0.98]">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
            Sign in
        </button>
    </form>

    {{-- ═══ Register form ═══ --}}
    <form method="POST" action="{{ route('register') }}" data-panel="register" class="space-y-4 sm:space-y-5 panel-form {{ $activeTab !== 'register' ? 'panel-hidden' : '' }}">
        @csrf
        {{-- Name + phone: side-by-side everywhere (50/50, mobile too) --}}
        <div class="grid grid-cols-2 gap-3 sm:gap-4">
            <x-float-input id="r-name" name="name" label="Your name" :value="old('name')" required autocomplete="name">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 20a8 8 0 0116 0M12 12a4 4 0 100-8 4 4 0 000 8z"/></svg>
            </x-float-input>

            {{-- data-bd-phone: tidied as it is typed, without ever touching text an
                 IME is still composing (partials/bd-phone). maxlength is 14, not
                 11, so a pasted "+8801712345678" fits before it is folded. --}}
            <x-float-input id="r-phone" name="phone" type="tel" label="Phone number" :value="old('phone')" required inputmode="numeric" maxlength="14" data-bd-phone autocomplete="tel">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path stroke-linecap="round" d="M11 18h2"/></svg>
            </x-float-input>
        </div>

        {{-- Email: always full width --}}
        <x-float-input id="r-email" name="email" type="email" label="Email address" :value="old('email')" required autocomplete="email" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
        </x-float-input>

        {{-- Password + confirm: side-by-side everywhere (50/50, mobile too) --}}
        <div class="grid grid-cols-2 gap-3 sm:gap-4">
            <x-float-input id="r-password" name="password" type="password" label="Password" required minlength="6" autocomplete="new-password" data-password>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path stroke-linecap="round" d="M8 11V7a4 4 0 118 0v4"/></svg>
                <x-slot:right>
                    <button type="button" class="toggle-password text-fg-faint hover:text-brand-500 transition p-1" tabindex="-1" aria-label="Show password">
                        <svg class="eye-open w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/></svg>
                        <svg class="eye-off w-4 h-4 hidden" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 5.2A9.5 9.5 0 0112 5c6 0 9.5 7 9.5 7a15 15 0 01-3.3 3.9M6.3 6.3A15 15 0 002.5 12S6 19 12 19a9.3 9.3 0 004-.9"/></svg>
                    </button>
                </x-slot:right>
            </x-float-input>

            <x-float-input id="r-confirm" name="password_confirmation" type="password" label="Repeat password" required minlength="6" autocomplete="new-password" data-password>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path stroke-linecap="round" d="M8 11V7a4 4 0 118 0v4"/></svg>
            </x-float-input>
        </div>

        <button type="submit"
                class="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm sm:text-base text-white bg-gradient-to-r from-accent-400 to-accent-600 hover:from-accent-500 hover:to-accent-700 shadow-lg shadow-accent-600/25 transition active:scale-[0.98]">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6"/></svg>
            Create account
        </button>
    </form>

    @push('scripts')
    @include('partials.bd-phone')
    <style>
        /* Panel animation styles */
        .panel-form {
            transition: opacity 0s, transform 0s;
        }
        .panel-hidden {
            display: none;
            opacity: 0;
            transform: translateY(10px);
        }
        @keyframes panelIn {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        .panel-entering {
            animation: panelIn 220ms cubic-bezier(.4,0,.2,1) forwards;
        }
        @keyframes panelOut {
            from { opacity: 1; transform: translateY(0); }
            to   { opacity: 0; transform: translateY(-8px); }
        }
        .panel-leaving {
            animation: panelOut 180ms cubic-bezier(.4,0,.2,1) forwards;
        }
    </style>
    <script>
    (function () {
        var tabs      = document.querySelectorAll('.tab-btn');
        var panels    = {
            login:    document.querySelector('[data-panel="login"]'),
            register: document.querySelector('[data-panel="register"]')
        };
        var indicator    = document.getElementById('tab-indicator');
        var dividerLabel = document.getElementById('email-divider-label');
        var current      = '{{ $activeTab }}';
        var animating    = false;

        // Position the sliding pill indicator over the active tab
        function moveIndicator(tabEl) {
            if (!indicator || !tabEl) return;
            var parent = tabEl.closest('[role="tablist"]');
            var pr     = parent.getBoundingClientRect();
            var tr     = tabEl.getBoundingClientRect();
            indicator.style.left  = (tr.left - pr.left) + 'px';
            indicator.style.width = tr.width + 'px';
        }

        function getTabEl(which) {
            return document.querySelector('.tab-btn[data-tab="' + which + '"]');
        }

        function activate(which) {
            if (which === current || animating) return;
            animating = true;
            var outPanel = panels[current];
            var inPanel  = panels[which];

            // Move the sliding indicator
            moveIndicator(getTabEl(which));

            // Update tab text colour
            tabs.forEach(function (t) {
                var on = t.getAttribute('data-tab') === which;
                t.classList.toggle('text-brand-500', on);
                t.classList.toggle('text-fg-subtle', !on);
            });

            if (dividerLabel)
                dividerLabel.textContent = which === 'register' ? 'or register with email' : 'or sign in with email';

            // Animate out current panel
            outPanel.classList.add('panel-leaving');
            outPanel.addEventListener('animationend', function onOut() {
                outPanel.removeEventListener('animationend', onOut);
                outPanel.classList.remove('panel-leaving');
                outPanel.classList.add('panel-hidden');

                // Animate in new panel
                inPanel.classList.remove('panel-hidden');
                inPanel.classList.add('panel-entering');
                inPanel.addEventListener('animationend', function onIn() {
                    inPanel.removeEventListener('animationend', onIn);
                    inPanel.classList.remove('panel-entering');
                    animating = false;
                }, { once: true });
            }, { once: true });

            current = which;
            try { history.replaceState(null, '', which === 'register' ? @json(route('register')) : @json(route('login'))); } catch (e) {}
        }

        // Initial indicator position (no animation on load)
        indicator.style.transition = 'none';
        moveIndicator(getTabEl(current));
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                indicator.style.transition = '';
            });
        });

        tabs.forEach(function (t) {
            t.addEventListener('click', function (e) { e.preventDefault(); activate(t.getAttribute('data-tab')); });
        });

        // Keep the pill aligned when the window resizes / phone rotates
        // (its position is computed in px, so it goes stale otherwise).
        window.addEventListener('resize', function () {
            indicator.style.transition = 'none';
            moveIndicator(getTabEl(current));
            requestAnimationFrame(function () { indicator.style.transition = ''; });
        });

        // Eye toggle
        document.querySelectorAll('.toggle-password').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var pwFields = document.querySelectorAll('[data-password]');
                var reveal   = pwFields.length && pwFields[0].type === 'password';
                pwFields.forEach(function (f) { f.type = reveal ? 'text' : 'password'; });
                document.querySelectorAll('.toggle-password').forEach(function (b) {
                    b.querySelector('.eye-open').classList.toggle('hidden', reveal);
                    b.querySelector('.eye-off').classList.toggle('hidden', !reveal);
                });
            });
        });
    })();
    </script>
    @endpush
@endsection

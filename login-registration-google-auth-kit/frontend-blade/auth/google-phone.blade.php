@extends('layouts.auth')

{{-- The last step of "Continue with Google" for an address the site has not
     seen before. Google has already supplied and verified the name and email,
     so they travel as hidden fields and the page asks for the one thing still
     missing: a phone number. No password — they pressed the Google button
     precisely so as not to make one up. Posts to the ordinary registration
     endpoint; CreateNewUser waives the password for the address Google
     vouched for, and for no other.

     If this project's registration needs something else Google cannot supply
     (a business name, a city), ask for it here, beside the phone number —
     and nothing Google already answered. --}}

@section('title', 'Your phone number')

@section('content')
    {{-- Who they are signed in as. Many people have more than one Gmail; this
         is where a wrong pick gets noticed. --}}
    <div class="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3">
        <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        <div class="min-w-0 flex-1">
            @if ($google['name'] !== '')
                <p class="truncate text-sm font-bold text-fg">{{ $google['name'] }}</p>
            @endif
            <p class="truncate text-xs text-fg-subtle">{{ $google['email'] }}</p>
        </div>
        <svg class="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    </div>

    <h1 class="mt-6 text-xl sm:text-2xl font-bold text-fg">Enter your phone number</h1>
    <p class="mt-1 text-sm text-fg-subtle">Just this one step — then your account is ready.</p>

    <form method="POST" action="{{ route('register') }}" class="mt-5 space-y-4 sm:space-y-5">
        @csrf
        <input type="hidden" name="email" value="{{ $google['email'] }}">

        @if ($google['name'] !== '')
            <input type="hidden" name="name" value="{{ $google['name'] }}">
        @else
            {{-- A Google account with no name on it: rare, but the account
                 here needs one, so this is the one time it is asked. A hidden
                 empty one would fail validation on a page with no box to fix
                 it in. --}}
            <x-float-input id="g-name" name="name" label="Your name" :value="old('name')" required autocomplete="name" autofocus>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 20a8 8 0 0116 0M12 12a4 4 0 100-8 4 4 0 000 8z"/></svg>
            </x-float-input>
        @endif

        <x-float-input id="g-phone" name="phone" type="tel" label="Phone number" :value="old('phone')" required inputmode="numeric" maxlength="14" data-bd-phone autocomplete="tel" :autofocus="$google['name'] !== ''">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path stroke-linecap="round" d="M11 18h2"/></svg>
        </x-float-input>

        <button type="submit"
                class="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm sm:text-base text-white bg-gradient-to-r from-accent-400 to-accent-600 hover:from-accent-500 hover:to-accent-700 shadow-lg shadow-accent-600/25 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            Finish
        </button>

        {{-- The way out: let go of the Google profile and get the ordinary
             form (and the Google button, for a different account) back. --}}
        <p class="text-center text-xs text-fg-subtle">
            Want to use a different email?
            <a href="{{ route('register', ['manual' => 1]) }}" class="font-semibold text-brand-500 hover:text-brand-400">Use the regular form</a>
        </p>
    </form>

    @push('scripts')
        @include('partials.bd-phone')
    @endpush
@endsection

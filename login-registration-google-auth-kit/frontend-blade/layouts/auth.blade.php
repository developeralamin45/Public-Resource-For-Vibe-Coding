<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    {{-- The Google button posts a token to /auth/google and needs this. --}}
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="theme-color" content="#0d0824">

    {{-- No-flash theme: set the class before first paint, or a dark-mode user
         gets a white flash on every page load. Keep this inline and in <head>;
         moving it to a bundled file is what puts the flash back. --}}
    <script>
        (function () {
            try {
                var stored = localStorage.getItem('theme');
                var isDark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.classList.toggle('dark', isDark);
                var meta = document.querySelector('meta[name="theme-color"]');
                if (meta) meta.setAttribute('content', isDark ? '#0d0824' : '#f7f5fb');
            } catch (e) {}
        })();
    </script>

    <title>@yield('title') — {{ config('app.name') }}</title>

    @vite(['resources/css/app.css'])
</head>
{{-- The ambient corner glows live in `.auth-shell` (auth-theme.css) rather than
     in child divs, so they survive a pinch-zoom out. See the note there. --}}
<body class="auth-shell antialiased text-fg-muted min-h-screen flex flex-col relative overflow-x-hidden">
    <div class="relative flex-1 flex items-center justify-center px-4 py-12">
        <div class="w-full max-w-md">
            <div class="glass-strong rounded-3xl shadow-2xl shadow-black/40 p-6 sm:p-9">
                @if (session('status'))
                    <div class="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm px-4 py-3 flex items-start gap-2">
                        <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <span>{{ session('status') }}</span>
                    </div>
                @endif
                @if ($errors->any())
                    <div class="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3">
                        <ul class="list-disc list-inside space-y-1">
                            @foreach ($errors->all() as $error)
                                <li>{{ $error }}</li>
                            @endforeach
                        </ul>
                    </div>
                @endif
                @yield('content')
            </div>
        </div>
    </div>

    @stack('scripts')
</body>
</html>

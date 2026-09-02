@props([
    'id',
    'name',
    'label',
    'type' => 'text',
    'value' => '',
    'required' => false,
    'autocomplete' => null,
    'inputmode' => null,
    'minlength' => null,
    'maxlength' => null,
])

{{-- Floating-label input: the label sits as a placeholder and floats up on
     focus / when filled (peer-based). Theme-aware via fg/ink tokens.
     Slots: default = the leading icon SVG; `right` = optional trailing element. --}}
<div class="relative">
    <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10 text-brand-500">
        {{ $slot }}
    </div>
    <input
        id="{{ $id }}"
        name="{{ $name }}"
        type="{{ $type }}"
        value="{{ $value }}"
        placeholder="{{ $label }}"
        @if($required) required @endif
        @if($autocomplete) autocomplete="{{ $autocomplete }}" @endif
        @if($inputmode) inputmode="{{ $inputmode }}" @endif
        @if($minlength) minlength="{{ $minlength }}" @endif
        @if($maxlength) maxlength="{{ $maxlength }}" @endif
        {{-- text-base on ALL widths, deliberately: an input under 16px makes
             iOS (Safari and the Facebook/Instagram in-app browsers alike)
             auto-zoom the page on focus — the screen lurches in, stays zoomed
             after blur, and the keyboard-aware kit stands down while zoomed.
             16px is the documented threshold that disables that zoom. --}}
        {{ $attributes->merge(['class' => 'peer w-full py-3.5 pl-10 sm:pl-11 '.(isset($right) ? 'pr-10' : 'pr-3').' rounded-xl border border-ink-700 bg-ink-850 text-fg text-base placeholder-transparent shadow-sm outline-none transition-all duration-200 hover:border-ink-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60']) }}
    >
    <label
        for="{{ $id }}"
        class="absolute left-8 sm:left-10 -top-2.5 bg-ink-900 px-1 text-xs sm:text-sm font-semibold text-brand-500 transition-all duration-200 whitespace-nowrap max-w-[70%] sm:max-w-[85%] overflow-hidden text-ellipsis cursor-text
            peer-placeholder-shown:text-base peer-placeholder-shown:font-normal peer-placeholder-shown:text-fg-faint
            peer-placeholder-shown:top-3.5 peer-placeholder-shown:left-10 sm:peer-placeholder-shown:left-11 peer-placeholder-shown:bg-transparent
            peer-focus:-top-2.5 peer-focus:left-8 sm:peer-focus:left-10 peer-focus:text-xs sm:peer-focus:text-sm peer-focus:font-semibold peer-focus:text-brand-500 peer-focus:bg-ink-900"
    >{{ $label }}</label>
    @isset($right)
        <div class="absolute inset-y-0 right-0 pr-3 flex items-center">{{ $right }}</div>
    @endisset
</div>

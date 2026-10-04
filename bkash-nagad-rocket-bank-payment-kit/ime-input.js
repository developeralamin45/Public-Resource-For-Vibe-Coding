/* ime-input.js — fields that rewrite what is typed, safely on a Bangla keyboard.
   Framework-agnostic, zero dependencies. Include once per page (anywhere).
   React projects use react/useImeInput.ts instead — the same rule as hooks.

   The kit's own checkout already does this inside send-money-checkout.js.
   This file is for EVERY OTHER field in the project that corrects its value
   as it is typed — a phone number folded to 01XXXXXXXXX, a TrxID upper-cased,
   a coupon code trimmed — on the order form, the signup page, the profile.
   Founders.com.bd found three hand-rolled copies of this rule drifting apart
   and one field (the profile's phone) that had none; one helper replaced all.

   THE BUG. An IME — a Bangla keyboard typing ০১৭…, Gboard's suggestion
   buffer, swipe typing — holds the half-finished word in a composition the
   browser owns; it is not in .value yet. Writing to .value mid-composition
   tears that buffer up: the caret snaps to the end and the IME's next
   keystroke rebuilds from text it no longer recognises, so "০১৭" comes out
   "০১৭১". A field that normalises on every `input` event is exactly that.

   THE RULE. Hold the raw text while a composition is open; normalise the
   moment it commits — on compositionend AND on blur, because Facebook's
   in-app WebView has been seen committing a composition WITHOUT ever firing
   compositionend, and a "composing" flag nothing clears mutes normalisation
   for the rest of the field's life. Normalise once more at submit, for the
   paste whose commit never came. keyboard-aware.js keeps the other half: it
   moves nothing on the page between compositionstart and compositionend.

     imeInput(input, normalize, commit?)
         normalize(raw) → the value the field should hold
         commit(value)  → called after every change (raw mid-composition)
     onEnterKey(input, fn)
         the keyboard's own enter / done / go key. An enter an IME is using to
         accept a word (isComposing, keyCode 229) is not ours and is ignored.

   And, declaratively, for plain form fields:
     <input data-enter="next" enterkeyhint="next">  enter moves to the form's
                                                    next visible field
     <input data-enter="done" enterkeyhint="done">  enter puts the keyboard away

   Without those, a field outside a <form> with a submit button swallows enter
   and the key labelled ✓ visibly does nothing — which, on a phone, reads as a
   page that has stuck. Inside such a form, the browser's implicit submit can
   fire an order with half its fields empty. The label and the behaviour of
   the key should always agree.

   Exposes window.imeInput and window.onEnterKey. Safe to include twice. */
(function () {
    if (window.imeInput) return;

    function imeInput(input, normalize, commit) {
        var open = false;
        function apply(v) {
            if (input.value !== v) input.value = v;
            if (commit) commit(v);
        }
        input.addEventListener('compositionstart', function () { open = true; });
        input.addEventListener('compositionend', function () { open = false; apply(normalize(input.value)); });
        input.addEventListener('input', function (e) {
            var mid = open || e.isComposing;
            apply(mid ? input.value : normalize(input.value));
        });
        input.addEventListener('blur', function () { open = false; apply(normalize(input.value)); });
    }

    function onEnterKey(input, fn) {
        input.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            fn();
        });
    }

    function nextField(input) {
        var scope = input.form || document;
        var fields = Array.prototype.filter.call(
            scope.querySelectorAll('input, select, textarea'),
            function (f) { return f.type !== 'hidden' && !f.disabled && f.offsetParent !== null; }
        );
        return fields[fields.indexOf(input) + 1] || null;
    }

    function bindDeclared() {
        Array.prototype.forEach.call(document.querySelectorAll('input[data-enter]:not([data-enter-bound])'), function (input) {
            input.setAttribute('data-enter-bound', '');
            onEnterKey(input, function () {
                var next = input.getAttribute('data-enter') === 'next' ? nextField(input) : null;
                if (next) next.focus(); else input.blur();
            });
        });
    }

    window.imeInput = imeInput;
    window.onEnterKey = onEnterKey;
    bindDeclared();
    document.addEventListener('DOMContentLoaded', bindDeclared);
})();

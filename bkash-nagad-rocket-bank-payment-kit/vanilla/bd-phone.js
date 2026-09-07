/* Bangladeshi phone input smart-normalizer.
   Framework-agnostic. Include once per page, BEFORE send-money-popup's script.
   Binds every input[data-bd-phone] (paste or type):
     • Bengali digits → Latin (০১৭… → 017…)
     • strips +, hyphens, spaces, anything non-digit
     • +880/880 country prefix → leading 0, "17…" (10 digits) → "017…"
     • caps at 11 digits
   Also exposes window.bdPhoneNormalize(raw) and window.bdPhoneValid(raw) for
   custom inputs (the checkout popup, whose field is a phone only for
   bKash/Nagad; submit-time guards on checkout forms).

   The rule is deliberately loose about the operator prefix — 11 digits
   starting 01, nothing said about the third digit. Operators reshuffle their
   ranges, so a hardcoded 013–019 list starts rejecting real customers the day
   a new range opens. If your server validates too (it should), keep the two
   rules identical. */
(function () {
    var BN = { '০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9' };
    var BD_MOBILE = /^01\d{9}$/;

    function normalize(raw) {
        var digits = String(raw || '')
            .replace(/[০-৯]/g, function (d) { return BN[d]; })
            .replace(/\D+/g, '');
        if (digits.indexOf('8801') === 0 && digits.length >= 13) digits = '0' + digits.slice(3);
        if (digits.length === 10 && digits.charAt(0) === '1') digits = '0' + digits;
        return digits.slice(0, 11);
    }

    window.bdPhoneNormalize = normalize;
    window.bdPhoneValid = function (raw) { return BD_MOBILE.test(normalize(raw)); };

    function apply(input) {
        var v = normalize(input.value);
        if (input.value !== v) input.value = v;
    }

    document.querySelectorAll('input[data-bd-phone]').forEach(function (input) {
        // An IME — a Bangla keyboard typing ০১৭…, Gboard's suggestion
        // buffer, swipe typing — holds the half-finished text in a
        // composition the browser owns, not in .value yet. Assigning to
        // .value mid-composition tears that buffer up: the caret snaps to
        // the end and the IME's next keystroke rebuilds from text it no
        // longer recognises, so "০১৭" comes out as "০১৭১". Let the
        // composition finish untouched and normalise the moment it commits.
        input.addEventListener('compositionstart', function () { input.dataset.imeOpen = '1'; });
        input.addEventListener('compositionend', function () {
            delete input.dataset.imeOpen;
            apply(input);
        });
        input.addEventListener('input', function (e) {
            if (e.isComposing || input.dataset.imeOpen) return;
            apply(input);
        });
        // Facebook's WebView has been seen committing a composition at blur
        // WITHOUT firing compositionend. Left alone, the stale imeOpen flag
        // would mute normalization for every keystroke after refocus — and
        // the field's current value never got its commit-time cleanup either.
        // Blur ends any composition by definition, so both are safe here.
        input.addEventListener('blur', function () {
            delete input.dataset.imeOpen;
            apply(input);
        });
    });
})();

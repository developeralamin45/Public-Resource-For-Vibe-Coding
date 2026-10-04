{{-- Bangladeshi phone input: tidies the number as it is typed or pasted.
     Include once per page; binds every input[data-bd-phone]:
     • Bengali, Arabic-Indic and Persian digits → Latin (০১৭… → 017…)
     • strips +, hyphens, spaces, anything non-digit
     • +880 / 880 / 00880 / 88 country prefix → leading 0, "17…" → "017…"
     • caps at 11 digits
     Also exposes window.bdPhoneNormalize(raw) and window.bdPhoneValid(raw).

     normalize() mirrors App\Support\Phone::normalize rule for rule, and the
     pattern mirrors Phone::PATTERN — 11 digits starting 01, with nothing said
     about the operator prefix. Change them there and here together.

     Not a Bangladeshi project? Keep the binding at the bottom — it is the part
     that makes ANY live-formatted field safe under an IME — and replace
     normalize() with the project's own rule, or drop the file. --}}
<script>
    (function () {
        var BD_MOBILE = /^01\d{9}$/;

        function toAsciiDigits(value) {
            return value.replace(/[০-৯٠-٩۰-۹]/g, function (d) {
                var code = d.charCodeAt(0);
                var base = code >= 0x09e6 ? 0x09e6 : code >= 0x06f0 ? 0x06f0 : 0x0660;
                return String(code - base);
            });
        }

        // Every rule is safe on a half-typed number: "8", "88", "880" stay put
        // and "8801" folds to "01" the moment it appears, which is what lets a
        // field run this on every keystroke without eating what is being typed.
        function normalize(raw) {
            var digits = toAsciiDigits(String(raw == null ? '' : raw)).replace(/\D+/g, '');

            digits = digits.replace(/^(?:00)+/, '');

            var national = false;
            if (/^880[01]/.test(digits)) { digits = digits.slice(3); national = true; }
            else if (/^881[3-9]/.test(digits)) { digits = digits.slice(2); national = true; }
            if (national) digits = digits.replace(/^0+/, '0');

            if (digits.charAt(0) === '1' && (national || /^1[3-9]/.test(digits) || digits.length === 10)) {
                digits = '0' + digits;
            }

            return digits;
        }

        window.bdPhoneNormalize = normalize;
        window.bdPhoneValid = function (raw) { return BD_MOBILE.test(normalize(raw)); };

        function apply(input) {
            var before = input.value;
            var after = normalize(before).slice(0, 11);
            if (before === after) return;

            // Assigning .value throws the caret to the end. Someone fixing a
            // digit in the middle of the number would then type the next one in
            // the wrong place, so put the caret back where it was, counted from
            // the end (tidying only ever removes or folds what is before it).
            var fromEnd = null;
            try {
                if (document.activeElement === input && input.selectionStart != null) {
                    fromEnd = before.length - input.selectionStart;
                }
            } catch (e) {}

            input.value = after;

            if (fromEnd !== null) {
                try {
                    var pos = Math.max(0, after.length - fromEnd);
                    input.setSelectionRange(pos, pos);
                } catch (e) {}
            }
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
            // The last line of defence: whatever state the IME left behind, the
            // number that is SUBMITTED is the tidy one. (The server normalizes
            // again; this is so the browser's own maxlength/pattern checks and
            // a password manager's saved value see the right thing.)
            if (input.form) {
                input.form.addEventListener('submit', function () {
                    delete input.dataset.imeOpen;
                    apply(input);
                }, true);
            }
            // A value the browser restored or autofilled before this ran.
            apply(input);
        });
    })();
</script>

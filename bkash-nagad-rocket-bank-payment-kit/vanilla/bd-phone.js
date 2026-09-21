/* bd-phone.js — Bangladeshi phone numbers, typed by real people.
 *
 * People do not type "01712345678". They type "০১৭১২৩৪৫৬৭৮" on a Bangla
 * keyboard, "+880 1712-345678" copied from a contact card, "01712 345 678"
 * with spaces, or paste a number with a stray dari (।) or comma on the end.
 * All of those are the SAME number. Fold everything to one canonical shape —
 * `01XXXXXXXXX` — and refuse only what genuinely cannot be a BD mobile number.
 *
 * Same rules as react/bdPhone.ts and server/node/smartpay-rules.js: a number
 * the browser accepts and the server rejects is a payment nobody can match.
 *
 * Exposes window.BdPhone = { toAsciiDigits, toBanglaDigits, sanitize,
 * normalize, isValid, validate, operator, formatTaka }.
 */
(function () {
    function toAsciiDigits(s) {
        return String(s).replace(/[০-৯٠-٩۰-۹]/g, function (d) {
            var c = d.charCodeAt(0);
            var base = c >= 0x09E6 ? 0x09E6 : c >= 0x06F0 ? 0x06F0 : 0x0660;
            return String(c - base);
        });
    }

    function toBanglaDigits(s) {
        return String(s).replace(/\d/g, function (d) { return '০১২৩৪৫৬৭৮৯'[Number(d)]; });
    }

    /* What the input field holds while typing: digits only, in local form.
       Idempotent and self-correcting as more digits arrive. */
    function sanitize(raw) {
        var d = toAsciiDigits(raw || '').replace(/\D/g, '');
        if (d.indexOf('00') === 0) d = d.slice(2);                 // 008801712… (IDD prefix)
        if (d.indexOf('8801') === 0) d = d.slice(2);               // 8801712…  → 01712…
        else if (d.indexOf('881') === 0) d = '0' + d.slice(2);     // 881712…   → 01712…
        else if (/^1[3-9]/.test(d)) d = '0' + d;                   // 1712…     → 01712…
        return d.slice(0, 11);
    }

    function isValid(phone) { return /^01[3-9]\d{8}$/.test(phone); }

    /* Errors are Bangla, and each one says exactly what is wrong. */
    function validate(raw) {
        var phone = sanitize(raw);
        if (!phone) return { ok: false, error: 'ফোন নম্বর লিখুন।' };
        if (phone.length >= 2 && phone.indexOf('01') !== 0) {
            return { ok: false, error: 'ফোন নম্বরটি ০১ দিয়ে শুরু হতে হবে (যেমন: 01712345678)।' };
        }
        if (phone.length < 11) return { ok: false, error: 'ফোন নম্বরটি ১১ ডিজিটের হতে হবে — আপনি ' + toBanglaDigits(String(phone.length)) + ' ডিজিট লিখেছেন।' };
        if (!isValid(phone)) {
            return { ok: false, error: 'অপারেটর কোডটি সঠিক নয় — নম্বর 013 / 014 / 015 / 016 / 017 / 018 / 019 দিয়ে শুরু হতে হবে।' };
        }
        if (/^(\d)\1{7}$/.test(phone.slice(3))) {
            return { ok: false, error: 'নম্বরটি সঠিক মনে হচ্ছে না — আপনার আসল মোবাইল নম্বরটি দিন।' };
        }
        return { ok: true, phone: phone };
    }

    function operator(phone) {
        if (!isValid(phone)) return null;
        return ({
            '013': 'গ্রামীণফোন', '017': 'গ্রামীণফোন',
            '014': 'বাংলালিংক', '019': 'বাংলালিংক',
            '015': 'টেলিটক', '016': 'এয়ারটেল', '018': 'রবি'
        })[phone.slice(0, 3)] || null;
    }

    /* ৳ amounts the way the page prints them: Bangla digits, thousands separated. */
    function formatTaka(amount) {
        return toBanglaDigits(Math.round(amount).toLocaleString('en-US'));
    }

    window.BdPhone = {
        toAsciiDigits: toAsciiDigits, toBanglaDigits: toBanglaDigits,
        sanitize: sanitize, normalize: sanitize, isValid: isValid, validate: validate,
        operator: operator, formatTaka: formatTaka
    };
})();

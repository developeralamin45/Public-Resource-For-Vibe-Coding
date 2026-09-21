/**
 * Bangladeshi phone numbers, typed by real people.
 *
 * People do not type "01712345678". They type "০১৭১২৩৪৫৬৭৮" on a Bangla
 * keyboard, "+880 1712-345678" copied from a contact card, "01712 345 678"
 * with spaces, or paste a number with a stray dari (।) or comma on the end.
 * All of those are the SAME number, and every one of them used to be stored
 * verbatim — which broke the SMS sender, the payment matcher and the
 * one-account-per-phone gate (a Bangla keyboard was enough to bypass it).
 *
 * So: fold everything to one canonical shape — `01XXXXXXXXX` — as the user
 * types, and refuse only what genuinely cannot be a BD mobile number.
 *
 * The SAME rules must run on the server (server/node/smartpay-rules.js
 * carries them): a number the browser accepts and the server rejects is a
 * payment nobody can match.
 */

// ─── Bengali (০-৯), Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII ───
export function toAsciiDigits(s: string): string {
    return s.replace(/[০-৯٠-٩۰-۹]/g, (d) => {
        const c = d.charCodeAt(0);
        const base =
            c >= 0x09E6 ? 0x09E6 : // Bengali ০-৯
            c >= 0x06F0 ? 0x06F0 : // Persian ۰-۹
            0x0660;                // Arabic  ٠-٩
        return String(c - base);
    });
}

/**
 * What the input field holds while typing: digits only, in local form.
 *
 * Safe to run on every keystroke — every rule below is idempotent and
 * self-correcting as more digits arrive (typing "8", "88", "880" stays put;
 * the moment "8801" appears it folds to "01").
 */
export function sanitizePhoneInput(raw: string): string {
    // Everything that is not a digit is a separator: spaces, -, (), ., ,, ।, /, +
    let d = toAsciiDigits(raw).replace(/\D/g, '');

    if (d.startsWith('00')) d = d.slice(2);              // 008801712… (IDD prefix)
    if (d.startsWith('8801')) d = d.slice(2);            // 8801712…  → 01712…
    else if (d.startsWith('881')) d = '0' + d.slice(2);  // 881712…   → 01712…
    else if (/^1[3-9]/.test(d)) d = '0' + d;             // 1712…     → 01712…

    return d.slice(0, 11); // a BD mobile number is never longer
}

/** ASCII digits → Bangla, so error messages read as one language. */
export function toBanglaDigits(s: string): string {
    return s.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
}

/** Canonical form for storage, lookups and SMS: `01XXXXXXXXX`. */
export const normalizeBdPhone = sanitizePhoneInput;

/** 11 digits, starts with 01, operator code 3-9 (013-019). */
export function isValidBdPhone(phone: string): boolean {
    return /^01[3-9]\d{8}$/.test(phone);
}

export type PhoneCheck =
    | { ok: true; phone: string }
    | { ok: false; error: string };

/**
 * Validates a typed number and hands back the canonical form.
 * Errors are Bangla, and each one says exactly what is wrong — "সঠিক নম্বর
 * দিন" tells a customer nothing about which of the eleven digits is wrong.
 */
export function validateBdPhone(raw: string): PhoneCheck {
    const phone = normalizeBdPhone(raw);

    if (!phone) return { ok: false, error: 'ফোন নম্বর লিখুন।' };
    // Prefix before length: told "01712" is too short, someone types more
    // digits; told "0912…" starts wrong, they fix the digit that is wrong.
    if (phone.length >= 2 && !phone.startsWith('01')) {
        return { ok: false, error: 'ফোন নম্বরটি ০১ দিয়ে শুরু হতে হবে (যেমন: 01712345678)।' };
    }
    if (phone.length < 11) return { ok: false, error: `ফোন নম্বরটি ১১ ডিজিটের হতে হবে — আপনি ${toBanglaDigits(String(phone.length))} ডিজিট লিখেছেন।` };
    if (!isValidBdPhone(phone)) {
        return { ok: false, error: 'অপারেটর কোডটি সঠিক নয় — নম্বর 013 / 014 / 015 / 016 / 017 / 018 / 019 দিয়ে শুরু হতে হবে।' };
    }
    // 01711111111 and friends: format-valid, but nobody's actual number.
    if (/^(\d)\1{7}$/.test(phone.slice(3))) {
        return { ok: false, error: 'নম্বরটি সঠিক মনে হচ্ছে না — আপনার আসল মোবাইল নম্বরটি দিন।' };
    }

    return { ok: true, phone };
}

/** Operator name for a valid number — shown as a live hint while typing. */
export function bdOperator(phone: string): string | null {
    if (!isValidBdPhone(phone)) return null;
    return ({
        '013': 'গ্রামীণফোন', '017': 'গ্রামীণফোন',
        '014': 'বাংলালিংক', '019': 'বাংলালিংক',
        '015': 'টেলিটক',
        '016': 'এয়ারটেল',
        '018': 'রবি',
    } as Record<string, string>)[phone.slice(0, 3)] || null;
}

/** ৳ amounts the way the page prints them: Bangla digits, thousands separated. */
export const formatTaka = (amount: number): string =>
    toBanglaDigits(Math.round(amount).toLocaleString('en-US'));

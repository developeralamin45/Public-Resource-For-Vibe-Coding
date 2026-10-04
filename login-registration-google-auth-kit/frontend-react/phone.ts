/**
 * Bangladeshi mobile numbers — the React mirror of App\Support\Phone.
 *
 * normalizePhone() matches Phone::normalize rule for rule, and BD_MOBILE matches
 * Phone::PATTERN: 11 digits starting 01, with nothing said about the operator
 * prefix (operators reshuffle their ranges; today's list is tomorrow's rejected
 * customer). Change the rule there and here together.
 *
 * Not a Bangladeshi project? Replace these two with the project's own rule and
 * keep useImeSafeInput — that part is not about Bangladesh.
 */

export const BD_MOBILE = /^01\d{9}$/;

/** Bengali (০-৯), Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII. */
function toAsciiDigits(value: string): string {
    return value.replace(/[০-৯٠-٩۰-۹]/g, (d) => {
        const code = d.charCodeAt(0);
        const base = code >= 0x09e6 ? 0x09e6 : code >= 0x06f0 ? 0x06f0 : 0x0660;
        return String(code - base);
    });
}

/**
 * Any shape in, canonical 01XXXXXXXXX out.
 *
 * Every rule is safe to run on a half-typed number: "8", "88", "880" stay put
 * and "8801" folds to "01" the moment it appears, which is what lets a field
 * call this on every keystroke.
 */
export function normalizePhone(raw: string | null | undefined): string {
    if (!raw) return '';

    let digits = toAsciiDigits(String(raw)).replace(/\D+/g, '');

    // "00 880 …" — the dialling prefix written instead of "+", or a doubled zero.
    digits = digits.replace(/^(?:00)+/, '');

    // The country code. What follows may or may not still carry its own zero:
    // "880 1712…", "880 01712…", and "88 1712…" from people who think +88.
    let national = false;
    if (/^880[01]/.test(digits)) {
        digits = digits.slice(3);
        national = true;
    } else if (/^881[3-9]/.test(digits)) {
        digits = digits.slice(2);
        national = true;
    }
    if (national) digits = digits.replace(/^0+/, '0');

    // The dropped leading zero: certain after a country code, obvious on a
    // mobile prefix ("17…"), and assumed for any ten digits starting 1.
    if (digits.startsWith('1') && (national || /^1[3-9]/.test(digits) || digits.length === 10)) {
        digits = `0${digits}`;
    }

    return digits;
}

/** What a phone FIELD should hold: normalized, and never longer than a number. */
export const phoneFieldValue = (raw: string): string => normalizePhone(raw).slice(0, 11);

export const isBdMobile = (raw: string | null | undefined): boolean => BD_MOBILE.test(normalizePhone(raw));

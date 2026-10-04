<?php

namespace App\Support;

/**
 * Bangladeshi mobile number normalizer.
 *
 * NOT A BANGLADESHI PROJECT? Delete this file and `partials/bd-phone.blade.php`
 * (or `frontend-react/phone.ts`), drop `data-bd-phone` from the phone inputs,
 * and validate the field with the project's own rule. What must survive is the
 * way the field is bound — never rewriting a value an IME is still composing.
 * See RECIPE.md, "Typing with an IME".
 *
 * People paste numbers in every shape imaginable — "+880 1712-345678",
 * "8801712345678", "০১৭১২৩৪৫৬৭৮" (Bengali digits), "01712 345 678",
 * "0088 01712…" off an old contact card, "+880 01712…" with the country code
 * AND the local zero. Validation should judge the NUMBER, not the formatting,
 * so every entry point normalizes first and then applies the same rule.
 *
 * That rule is deliberately loose about the operator prefix. Operators here
 * reshuffle their ranges, and a rule that hardcodes today's 013–019 list turns
 * tomorrow's perfectly good number into a rejected sign-up. Length and the
 * leading 01 are what actually distinguish a mobile number from a typo, so
 * that is all this checks. The third digit is the operator's business.
 *
 * Change it HERE and nowhere else: this constant is the one definition, mirrored
 * by `partials/bd-phone.blade.php` for Blade pages and `frontend-react/phone.ts`
 * for React. normalize() is mirrored in the same two places, rule for rule — a
 * number the field corrects one way and the server another is a customer
 * nobody can call back.
 */
class Phone
{
    /** The shared rule, without regex delimiters. */
    public const PATTERN = '^01\d{9}$';

    /** The same rule as a usable preg pattern. */
    public const REGEX = '/'.self::PATTERN.'/';

    /** The strict validation rule every phone field shares. */
    public const RULES = ['required', 'string', 'size:11', 'regex:'.self::REGEX];

    /**
     * Normalize a raw phone input to the canonical 01XXXXXXXXX form.
     * Returns the cleaned digits — validation still decides acceptance,
     * so garbage in stays garbage (just tidier garbage).
     */
    public static function normalize(?string $raw): string
    {
        $value = (string) $raw;

        // Bengali, Arabic-Indic and Persian digits → Latin. A Bangla keyboard
        // is the common one; the other two arrive by paste.
        $value = strtr($value, [
            '০' => '0', '১' => '1', '২' => '2', '৩' => '3', '৪' => '4',
            '৫' => '5', '৬' => '6', '৭' => '7', '৮' => '8', '৯' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        ]);

        // Drop +, hyphens, spaces, parentheses — anything not a digit.
        $digits = preg_replace('/\D+/', '', $value) ?? '';

        // "00 880 …" — the dialling prefix some people write instead of "+".
        // No mobile number starts with two zeros, so a doubled zero goes too.
        $digits = preg_replace('/^(?:00)+/', '', $digits) ?? '';

        // The country code. What follows is the national number, which may or
        // may not still carry its own zero: "880 1712…", "880 01712…", and
        // "88 1712…" from people who think of the code as +88.
        $national = false;

        if (preg_match('/^880[01]/', $digits)) {
            $digits = substr($digits, 3);
            $national = true;
        } elseif (preg_match('/^881[3-9]/', $digits)) {
            $digits = substr($digits, 2);
            $national = true;
        }

        if ($national) {
            $digits = preg_replace('/^0+/', '0', $digits) ?? '';
        }

        // The dropped leading zero: certain after a country code, obvious on a
        // mobile prefix ("17…"), and assumed for any ten digits starting 1.
        if (str_starts_with($digits, '1')
            && ($national || preg_match('/^1[3-9]/', $digits) || strlen($digits) === 10)) {
            $digits = '0'.$digits;
        }

        return $digits;
    }

    /** Is this a Bangladeshi mobile number? Normalizes first, so any shape is fair game. */
    public static function isValid(?string $raw): bool
    {
        return preg_match(self::REGEX, self::normalize($raw)) === 1;
    }

    /**
     * The same rule for a field that may legitimately be left blank.
     *
     * @return array<int, string>
     */
    public static function optionalRules(): array
    {
        return ['nullable', 'string', 'size:11', 'regex:'.self::REGEX];
    }

    /**
     * One set of messages for the shared rule, keyed for a given field. The
     * Bangla wording is in copy-bangla.md.
     *
     * @return array<string, string>
     */
    public static function messages(string $field = 'phone'): array
    {
        return [
            "{$field}.required" => 'Enter your phone number.',
            "{$field}.size" => 'Enter a valid 11-digit phone number.',
            "{$field}.regex" => 'Enter a valid Bangladeshi mobile number (e.g. 01712345678).',
        ];
    }
}

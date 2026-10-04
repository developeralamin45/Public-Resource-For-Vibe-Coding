import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, CompositionEvent, FocusEvent, KeyboardEvent } from 'react';

/**
 * A controlled input that formats as you type — without breaking an IME.
 *
 * The bug it exists for: a field that rewrites its value on every change
 * (a phone number tidied to 01XXXXXXXXX, an amount, an uppercase code) is
 * fine on a Latin keyboard and broken on a Bangla one. An IME — a Bangla
 * keyboard typing ০১৭…, Gboard's suggestion buffer, swipe typing — holds the
 * half-finished text in a composition the browser owns. A controlled React
 * input that answers each keystroke by setting a DIFFERENT value tears that
 * buffer up: the caret snaps to the end, and the IME rebuilds from text it no
 * longer recognises, so "০১৭" comes out as "০১৭১".
 *
 * The rule: between compositionstart and compositionend the field shows
 * exactly what the IME wrote (a local draft), and `format` runs once, when the
 * composition commits. Outside a composition it runs on every change, as
 * before.
 *
 *     const phone = useImeSafeInput(value, setValue, phoneFieldValue);
 *     <input type="tel" inputMode="numeric" {...phone} />
 *
 * Spread the result onto any input, including the project's own input
 * component, as long as it forwards these props to the real <input>.
 */
export function useImeSafeInput(
    value: string,
    onChange: (next: string) => void,
    format: (raw: string) => string = (raw) => raw,
) {
    // Non-null only while an IME holds the text.
    const [draft, setDraft] = useState<string | null>(null);
    const composing = useRef(false);

    const commit = useCallback(
        (raw: string) => {
            composing.current = false;
            setDraft(null);
            const next = format(raw);
            if (next !== value) onChange(next);
        },
        [format, onChange, value],
    );

    return {
        value: draft ?? value,

        onCompositionStart: () => {
            composing.current = true;
        },

        onCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => commit(e.currentTarget.value),

        onChange: (e: ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value;
            // Both signals: `isComposing` on the native event, and our own flag
            // for the browsers that fire the change before they set it.
            if (composing.current || (e.nativeEvent as InputEvent).isComposing) {
                setDraft(raw);
                return;
            }
            commit(raw);
        },

        // Facebook's WebView has been seen committing a composition at blur
        // WITHOUT firing compositionend, which would leave the field stuck on
        // its draft. Blur ends any composition by definition.
        onBlur: (e: FocusEvent<HTMLInputElement>) => commit(e.currentTarget.value),
    };
}

/**
 * Was this Enter pressed to confirm an IME candidate, rather than to submit?
 *
 * Use it in any onKeyDown that acts on Enter. (A plain <form onSubmit> needs
 * nothing: browsers do not submit a form on the Enter that commits a
 * composition — except Safari, which reports that Enter as keyCode 229 after
 * the composition has already ended, hence the second check.)
 *
 *     onKeyDown={(e) => { if (e.key === 'Enter' && !isImeEnter(e)) submit(); }}
 */
export function isImeEnter(e: KeyboardEvent): boolean {
    return e.nativeEvent.isComposing || e.keyCode === 229;
}

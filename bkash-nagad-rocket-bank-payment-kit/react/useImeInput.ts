import { useRef } from 'react';
import type { ChangeEvent, CompositionEvent, FocusEvent } from 'react';

/**
 * An input that normalizes what it is given — safely, on a Bangla keyboard.
 *
 * The bug this exists for: an IME (a Bangla keyboard typing ০১৭…, Gboard's
 * suggestion buffer, swipe typing) holds half-finished text in a composition
 * the browser owns — it is not in `.value` yet. Assigning to `.value`
 * mid-composition tears that buffer up: the caret snaps to the end and the
 * IME's next keystroke rebuilds from text it no longer recognises, so "০১৭"
 * comes out "০১৭১". Our phone and TrxID fields rewrite their value on every
 * keystroke, which is exactly the shape of that bug.
 *
 * So: hold the raw text untouched while a composition is open, and normalize
 * the moment it commits.
 *
 * Two commits, not one. Facebook's in-app WebView has been seen committing a
 * composition at blur WITHOUT ever firing `compositionend` — and a "we are
 * composing" flag that nothing clears would mute normalization for the rest of
 * the field's life. Blur ends a composition by definition, so it counts as a
 * commit too, and normalizing there is idempotent when the event did arrive.
 * Callers should still normalize once more at submit, for the paste whose
 * commit never came at all.
 */
export function useImeInput(
    normalize: (raw: string) => string,
    commit: (value: string) => void,
) {
    const imeOpen = useRef(false);

    return {
        onChange: (e: ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value;
            const mid = imeOpen.current || (e.nativeEvent as InputEvent).isComposing;
            commit(mid ? raw : normalize(raw));
        },
        onCompositionStart: () => { imeOpen.current = true; },
        onCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => {
            imeOpen.current = false;
            commit(normalize(e.currentTarget.value));
        },
        onBlur: (e: FocusEvent<HTMLInputElement>) => {
            imeOpen.current = false;
            commit(normalize(e.currentTarget.value));
        },
    };
}

/**
 * The keyboard's own enter key, wired to submit.
 *
 * On the one screen standing between money already sent and the order that
 * records it, the submit button is the control most likely to be behind the
 * keyboard — and enter is the one control a keyboard can never cover.
 *
 * `isComposing` / keyCode 229 mean an IME is claiming the keystroke to accept
 * a candidate word. That enter is not ours.
 */
export function submitOnEnter(submit: () => void) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        submit();
    };
}

/**
 * The keyboard's "next" key, kept honest: enter moves focus to the field
 * with this id instead of inserting a newline nobody asked for. Pair it with
 * enterKeyHint="next" so the key is labelled for what it does.
 */
export function nextOnEnter(nextId: string) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        document.getElementById(nextId)?.focus();
    };
}

/**
 * The keyboard's "done" key, doing what it says: enter puts the keyboard
 * away. Without this, a field outside a <form> swallows enter and the key
 * labelled ✓ visibly does nothing — which on a phone reads as "stuck".
 */
export function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    e.currentTarget.blur();
}

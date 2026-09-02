import { useEffect } from 'react';

/**
 * Locks body scroll while `locked` is true. Reference-counted so nested
 * lockers (modal inside drawer, stacked modals) don't fight each other,
 * and always restores the previous overflow value on cleanup/unmount.
 */
let lockCount = 0;
let previousOverflow = '';

export default function useBodyScrollLock(locked: boolean): void {
    useEffect(() => {
        if (!locked) return;

        if (lockCount === 0) {
            previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        lockCount += 1;

        return () => {
            lockCount -= 1;
            if (lockCount === 0) {
                document.body.style.overflow = previousOverflow;
            }
        };
    }, [locked]);
}

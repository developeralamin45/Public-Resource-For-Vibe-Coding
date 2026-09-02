import { useEffect } from 'react';
import type { ReactNode } from 'react';
import useBodyScrollLock from './useBodyScrollLock';

interface ModalProps {
    /** Controls visibility; the component renders nothing when false. */
    open?: boolean;
    title: ReactNode;
    onClose: () => void;
    children: ReactNode;
    /** Max-width utility for the panel (default max-w-lg). */
    panelClassName?: string;
}

/**
 * Simple fixed-overlay modal (no portal): dark blurred backdrop + glass panel.
 * Closes on overlay click and Escape; locks body scroll while open.
 */
export default function Modal({ open = true, title, onClose, children, panelClassName = 'max-w-lg' }: ModalProps) {
    useBodyScrollLock(open);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
            {/* Overlay */}
            <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
            />
            {/* Panel */}
            <div className={`glass-strong relative w-full ${panelClassName} max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl shadow-black/40`}>
                <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-5 py-4">
                    <h2 className="min-w-0 truncate text-base font-semibold text-fg">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-subtle transition-colors duration-150 hover:bg-ink-800 hover:text-fg"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="px-5 py-4">{children}</div>
            </div>
        </div>
    );
}

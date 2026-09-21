/**
 * SendMoneyCheckout — the whole flow, as the production landing page has it:
 *
 *   the section heading → name + phone → the four method tiles
 *   → the sticky pay button at the foot of the screen
 *   → the popup (SendMoneyPopup) → the done card once a claim is on record
 *   → the WhatsApp bubble that yields to the form
 *
 * Give it the amount, the merchant numbers and the four callbacks; it does
 * the rest. Load checkout.css once, and keyboard-aware.js once per page.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Fa, BankTileIcon } from './icons';
import { nextOnEnter, blurOnEnter } from './useImeInput';
import { useSendMoneyCheckout } from './useSendMoneyCheckout';
import type { CheckoutOptions } from './useSendMoneyCheckout';
import { SendMoneyPopup, DEFAULT_LOGOS, whatsappUrl, whatsappText } from './SendMoneyPopup';
import type { SupportOptions } from './SendMoneyPopup';
import type { PaymentMethod } from './payment';

export interface SendMoneyCheckoutProps extends CheckoutOptions {
    /** The heading over the section. `null` hides it (you have your own). */
    heading?: string | null;
    /** After "মোট পরিমাণ" in the popup: "বার্ষিক", "প্রিমিয়াম কোর্স"… */
    amountTag?: string;
    /** Under the done card's method line: "• বার্ষিক প্ল্যান". */
    doneSuffix?: string;
    /** WhatsApp support: the line in the popup, and the floating bubble. Omit → neither. */
    support?: SupportOptions & { bubble?: boolean };
    /** The sticky bar at the foot of the screen (default on). Off → drive it through the ref. */
    stickyCta?: boolean;
    logos?: Partial<typeof DEFAULT_LOGOS>;
    /** Extra class on the section (for spacing in your layout). */
    className?: string;
}

export interface SendMoneyCheckoutHandle {
    /** What the sticky button does: name and number first, then the popup for the selected method. */
    pay: () => void;
    /** Open the popup for a method directly (the lead form is skipped). */
    open: (method: PaymentMethod) => void;
    /** Forget a claim on record (the done card's own link does the same). */
    reset: () => void;
}

export const SendMoneyCheckout = forwardRef<SendMoneyCheckoutHandle, SendMoneyCheckoutProps>(function SendMoneyCheckout(props, ref) {
    const { heading, amountTag, doneSuffix, support, stickyCta = true, logos, className, ...options } = props;
    const c = useSendMoneyCheckout(options);
    const L = c.labels;
    const logoOf = (key: 'bkash' | 'nagad' | 'rocket') => (logos && logos[key]) || DEFAULT_LOGOS[key];

    useImperativeHandle(ref, () => ({ pay: c.cta, open: c.openPopup, reset: c.reset }));

    // ── The second door: WhatsApp ──
    // Some of the people this page is for will not put a name and a number
    // into a form and send money to a stranger's bKash — but they will ask a
    // person. The bubble floats above the sticky CTA the whole way down the
    // page and yields to the form: scrolled down to the fields, the page is
    // asking for exactly one thing, and a second green button beside that
    // ask is a second question. So it slides out as this section reaches
    // the upper half of the screen, and back in when they scroll up. It
    // also waits 1.2 s after first paint so it is not part of the first
    // impression.
    const bubbleWanted = !!support && support.bubble !== false;
    const [bubbleOn, setBubbleOn] = useState(false);
    const sectionRef = useRef<HTMLElement>(null);
    useEffect(() => {
        if (!bubbleWanted) return;
        let settled = false;
        let inView = false;
        const apply = () => setBubbleOn(settled && !inView);
        const timer = window.setTimeout(() => { settled = true; apply(); }, 1200);
        if (typeof IntersectionObserver === 'undefined' || !sectionRef.current) return () => clearTimeout(timer);
        const io = new IntersectionObserver(entries => {
            for (const e of entries) inView = e.isIntersecting;
            apply();
        }, { rootMargin: '0px 0px -45% 0px' }); // the top 55% of the viewport
        io.observe(sectionRef.current);
        return () => { clearTimeout(timer); io.disconnect(); };
    }, [bubbleWanted]);

    return (
        <>
            <section className={`bd-pay${className ? ` ${className}` : ''}`} ref={sectionRef}>
                {heading !== null && (
                    <div className="dynamic-header">
                        <div className="header-line flow-1"></div>
                        <div className="header-content">
                            <div className="header-icon-wrapper"><Fa icon="credit-card" className="icon-grad-3" /></div>
                            <span className="gradient-text-3">{heading ?? L.heading}</span>
                        </div>
                        <div className="header-line flow-1"></div>
                    </div>
                )}

                {c.done && c.donePm ? (
                    <div className="glass-list pay-done-card">
                        <div className={`pay-done-icon${c.done.verified ? '' : ' waiting'}`}><Fa icon={c.done.verified ? 'circle-check' : 'circle-exclamation'} /></div>
                        <div className="pay-done-title">{c.done.verified ? L.doneVerifiedTitle : L.doneTitle}</div>
                        <div className="pay-done-sub">
                            {c.donePm.bn} • <strong>{c.done.reference}</strong>
                            {doneSuffix && <> {doneSuffix}</>}
                        </div>
                        {/* A claim the money has not confirmed says so — a card that
                            reads "done" to someone who sent nothing is a lie. */}
                        {!c.done.verified && (
                            <div className="pay-done-note">
                                {L.doneNote}
                                <button type="button" data-act="recheck" onClick={c.recheckDone}><Fa icon="search" /> {L.doneRecheck}</button>
                            </div>
                        )}
                        <button type="button" className="pay-done-btn" data-act="success" onClick={() => c.onSuccess(c.done!)}>
                            {L.doneButton} <Fa icon="arrow-right" />
                        </button>
                        <button type="button" className="pay-done-reset" data-act="reset" onClick={c.reset}>
                            <Fa icon="rotate-left" /> {L.doneReset}
                        </button>
                    </div>
                ) : (
                    <div className="glass-list">
                        {/* Name + number, above the methods. The label rides up out
                            of the box once there is a value in it, so the field
                            explains itself without a caption sitting above it. */}
                        {c.askLead && (
                            <div className="lead-card">
                                <div className="lead-field">
                                    <input
                                        id="bdpay-lead-name"
                                        className={`lead-input${c.leadError === 'name' ? ' invalid' : ''}`}
                                        type="text"
                                        value={c.leadName}
                                        onChange={e => c.onLeadNameChange(e.target.value)}
                                        placeholder={L.leadName}
                                        autoComplete="name"
                                        enterKeyHint="next"
                                        onKeyDown={nextOnEnter('bdpay-lead-phone')}
                                        maxLength={60}
                                        required
                                        aria-invalid={c.leadError === 'name'}
                                    />
                                    <label htmlFor="bdpay-lead-name">{L.leadName} <span className="lead-req">*</span></label>
                                    <Fa icon="user" />
                                    {c.leadError === 'name' && <p className="lead-error">{L.leadNameError}</p>}
                                </div>
                                <div className="lead-field">
                                    <input
                                        id="bdpay-lead-phone"
                                        className={`lead-input${c.leadError === 'phone' ? ' invalid' : ''}`}
                                        type="tel"
                                        inputMode="numeric"
                                        value={c.leadPhone}
                                        {...c.leadPhoneIme}
                                        placeholder={L.leadPhone}
                                        autoComplete="tel"
                                        enterKeyHint="done"
                                        onKeyDown={blurOnEnter}
                                        required
                                        aria-invalid={c.leadError === 'phone'}
                                    />
                                    <label htmlFor="bdpay-lead-phone">{L.leadPhone} <span className="lead-req">*</span></label>
                                    <Fa icon="phone" />
                                    {c.leadError === 'phone' && <p className="lead-error">{L.leadPhoneError}</p>}
                                </div>
                            </div>
                        )}

                        <div className="pay-method-grid">
                            {c.methods.map(pm => {
                                const isSelected = c.selectedMethod === pm.key;
                                return (
                                    <button key={pm.key} type="button"
                                        className={`pay-method-card${isSelected ? ' selected' : ''}`}
                                        data-method={pm.key}
                                        style={{ '--pm-color': pm.color, '--pm-soft': pm.soft } as React.CSSProperties}
                                        onClick={() => c.setSelectedMethod(pm.key)}>
                                        {isSelected && (
                                            <span className="pay-method-check"><Fa icon="check" /></span>
                                        )}
                                        <div className={`pay-method-logo${pm.key === 'bank' ? ' bank' : ''}`}>
                                            {pm.key === 'bank' ? <BankTileIcon /> : <img src={logoOf(pm.key)} alt={pm.label} />}
                                        </div>
                                        <span className="pay-method-name">{pm.bn}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </section>

            {/* Sticky Bottom CTA */}
            {stickyCta && (
                <div className="bd-pay">
                    <div className="sticky-cta">
                        <button type="button" className="sticky-cta-btn" onClick={c.cta}>
                            <span className="cta-shine"></span>
                            <span className="cta-label">
                                {c.done ? L.ctaDone : L.ctaPay(c.amount)}
                            </span>
                            <span className="cta-arrow"><Fa icon="arrow-right" /></span>
                        </button>
                    </div>
                </div>
            )}

            {/* Floating WhatsApp bubble. Gone while the popup is open: the popup
                has its own line, and a bubble over a modal is a bubble over the
                wrong thing. */}
            {bubbleWanted && !c.payUi && support && (
                <div className="bd-pay">
                    <a className={`wa-bubble${bubbleOn ? ' on' : ''}`} href={whatsappUrl(support.whatsapp, whatsappText(c, support, 'bubble'))} target="_blank" rel="noopener noreferrer"
                        aria-label="WhatsApp-এ জিজ্ঞেস করুন" title="WhatsApp-এ জিজ্ঞেস করুন"
                        onClick={() => c.whatsappTap('bubble')}>
                        <Fa icon="whatsapp" />
                    </a>
                </div>
            )}

            <SendMoneyPopup checkout={c} amountTag={amountTag} support={support} logos={logos} />
        </>
    );
});

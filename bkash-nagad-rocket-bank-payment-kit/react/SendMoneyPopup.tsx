/**
 * The send-money popup: one form (amount, the number to copy, the three
 * steps, the field and "লেনদেন যাচাই করুন"), then the answer — one card
 * tinted by its kind — and the close confirmation over it all.
 *
 * Presentational. Its state comes from useSendMoneyCheckout; the markup and
 * class names are the production page's, and checkout.css draws them.
 * Portaled to <body> so the overlay escapes every ancestor stacking context
 * — un-portal it and a sticky header paints over the backdrop.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { Fa, Glyph, BankTileIcon } from './icons';
import { bankRows, isTrxMethod, isWalletMethod, PAYMENT_METHODS } from './payment';
import { formatTaka } from './bdPhone';
import { submitOnEnter } from './useImeInput';
import type { SendMoneyCheckoutState } from './useSendMoneyCheckout';

import bkashLogo from './assets/bkash.webp';
import nagadLogo from './assets/nagad.webp';
import rocketLogo from './assets/rocket.webp';

export const DEFAULT_LOGOS: Record<'bkash' | 'nagad' | 'rocket', string> = {
    bkash: bkashLogo, nagad: nagadLogo, rocket: rocketLogo,
};

export interface SupportOptions {
    /** International format without +, e.g. "8801712345678". Omit → no WhatsApp line anywhere. */
    whatsapp: string;
    /** What the visitor is buying, for the prefilled message: "Smart Voice Writer-এর বার্ষিক প্ল্যান (২,৯৫০ টাকা)". */
    offer?: string;
}

export const whatsappUrl = (number: string, text?: string): string =>
    `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** The prefilled WhatsApp text: the name once they have typed one, the offer,
 *  and — from the popup — which wallet is giving them trouble. */
export const whatsappText = (state: SendMoneyCheckoutState, support: SupportOptions, where: 'bubble' | 'popup'): string => {
    const name = state.leadName.trim();
    const intro = name ? `আমি ${name}। ` : '';
    const offer = support.offer || `${formatTaka(state.amount)} টাকার পেমেন্ট`;
    return where === 'popup' && state.activePm
        ? `${intro}${offer} — ${state.activePm.bn}-এ টাকা পাঠাতে গিয়ে একটু সমস্যা হচ্ছে।`
        : `${intro}${offer} নিয়ে জানতে চাই।`;
};

export interface SendMoneyPopupProps {
    checkout: SendMoneyCheckoutState;
    /** Shown after "মোট পরিমাণ": the plan or product, e.g. "বার্ষিক" → "মোট পরিমাণ (বার্ষিক)". */
    amountTag?: string;
    support?: SupportOptions;
    logos?: Partial<typeof DEFAULT_LOGOS>;
    /** Render somewhere other than document.body (tests, shadow roots). */
    portalTarget?: Element | null;
}

export const SendMoneyPopup: React.FC<SendMoneyPopupProps> = ({ checkout: c, amountTag, support, logos, portalTarget }) => {
    const L = c.labels;
    const { payUi, activePm, payingBank, bank, claim } = c;
    if (!payUi || !activePm) return null;
    const logoOf = (key: 'bkash' | 'nagad' | 'rocket') => (logos && logos[key]) || DEFAULT_LOGOS[key];
    const price = c.amount;
    const amountLabel = `৳${price.toLocaleString('en-US')}`;
    const trx = isTrxMethod(payUi.method);
    const walletTabs = PAYMENT_METHODS.filter(m => isWalletMethod(m.key) && c.methods.some(a => a.key === m.key));

    /** The number — or the whole bank account — the money goes to. The
     *  caption is dropped where the box around it already says it. */
    const receiverBlock = (label = true) => {
        if (payingBank) {
            return bank && (
                <>
                    {label && <div className="pay-label"><Fa icon="building-columns" /> {L.receiverBank}</div>}
                    <div className="pay-bank">
                        {bankRows(bank).map(row => (
                            <div className="pay-bank-row" key={row.label}>
                                <span className="pay-bank-lbl">{row.label}</span>
                                <span className={`pay-bank-val${row.mono ? ' mono' : ''}`}>{row.value}</span>
                            </div>
                        ))}
                        <button type="button" className={`pay-copy-all${c.copiedAll ? ' copied' : ''}`} data-act="copy-all" onClick={c.copyBank}>
                            <Fa icon={c.copiedAll ? 'check' : 'copy'} /> {c.copiedAll ? L.copied : L.copyAll}
                        </button>
                    </div>
                </>
            );
        }
        return (
            <>
                {label && <div className="pay-label"><Fa icon="phone" /> {L.receiverWallet}</div>}
                <div className="pay-number-box">
                    <span className="pay-number">{c.walletReceiver}</span>
                    <button type="button" className="pay-copy-btn" data-act="copy" onClick={c.copyNumber}>
                        <Fa icon={c.copied ? 'check' : 'copy'} /> {c.copied ? L.copied : L.copy}
                    </button>
                </div>
            </>
        );
    };

    const waHelp = (text: string, strong: string) => support ? (
        <a className="wa-help" href={whatsappUrl(support.whatsapp, whatsappText(c, support, 'popup'))} target="_blank" rel="noopener noreferrer"
            onClick={() => c.whatsappTap('popup')}>
            <Fa icon="whatsapp" />
            <span>{text} <strong>{strong}</strong></span>
        </a>
    ) : null;

    /**
     * What the server said about the number. Every branch that is not
     * "found" carries the number to send to: the person who never sent
     * anything is looking at exactly what is missing, and the person whose
     * SMS is late is told so in words that do not accuse.
     */
    const claimPanel = () => {
        if (!claim || !c.claimTiming) return null;
        const { remainingMs, showContinue } = c.claimTiming;
        const remaining = `${Math.floor(remainingMs / 60000)}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0')}`;
        const changeLink = !payingBank && (
            <button type="button" className="pay-check-change" data-act="change" onClick={c.changeClaimNumber}>
                <Glyph icon="pencil" /> {trx ? L.changeId : L.changeNumber}
            </button>
        );
        // Most people who see this panel have not sent anything yet, so the
        // condition is said outright — "if you have not sent yet" — but as
        // something normal rather than an accusation, and followed by what
        // sending gets them rather than an instruction.
        const payNow = (
            <div className="pay-check-pay">
                <div className="pay-check-pay-ttl">
                    <span>{L.payNowTitle}</span>
                    <b>{amountLabel}</b>
                </div>
                {receiverBlock(false)}
                <div className="pay-check-pay-note"><Glyph icon="check" /> {L.payNowNote}</div>
            </div>
        );
        const continueBtn = (primary: boolean) => (
            <button type="button" className={primary ? 'pay-submit' : 'pay-continue'} data-act="continue" onClick={c.continueUnverified}>
                <span>{L.continueButton} <Glyph icon="arrow-right" className="pay-btn-icon" /></span>
            </button>
        );

        if (claim.phase === 'checking') {
            return (
                <div className="pay-check">
                    <div className="pay-check-card">
                        <div className="pay-check-head">
                            <div className="pay-check-spin" aria-hidden="true" />
                            <div className="pay-check-txt">
                                <div className="pay-check-ttl">{L.checkingTitle}</div>
                                <div className="pay-check-sub">{trx ? <>TrxID <strong>{payUi.value}</strong>-এর</> : <><strong>{payUi.value}</strong> থেকে পাঠানো</>} {amountLabel} {L.checkingSuffix}</div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        if (claim.phase === 'found' && claim.result?.found) {
            return (
                <div className="pay-check ok">
                    <div className="pay-check-card">
                        <div className="pay-check-head">
                            <div className="pay-check-icon"><Glyph icon="check" /></div>
                            <div className="pay-check-txt">
                                <div className="pay-check-ttl">{L.foundTitle(`৳${claim.result.amount.toLocaleString('en-US')}`)}</div>
                                <div className="pay-check-sub">{L.foundSub}</div>
                            </div>
                        </div>
                    </div>
                    <button type="button" className="pay-submit" data-act="found-go" onClick={() => { if (c.done) { c.closePopup(); c.onSuccess(c.done); } }}>
                        {L.foundButton} <Glyph icon="arrow-right" className="pay-btn-icon" />
                    </button>
                </div>
            );
        }
        if (claim.phase === 'missing') {
            return (
                <div className="pay-check warn">
                    {/* One card: what happened on top; underneath, on one line,
                        what is happening now (the live check, its clock) and
                        the one correction they can make. */}
                    <div className="pay-check-card">
                        <div className="pay-check-head">
                            <div className="pay-check-icon"><Glyph icon="hourglass" /></div>
                            <div className="pay-check-txt">
                                <div className="pay-check-ttl">{L.missingTitle}</div>
                                <div className="pay-check-sub">{payingBank ? L.missingSubBank : L.missingSubWallet}</div>
                            </div>
                        </div>
                        {!payingBank && (
                            <div className={`pay-check-foot${claim.polling ? '' : ' ended'}`}>
                                {claim.polling
                                    ? <><span className="pay-check-dot" /><span className="pay-check-foot-txt">{L.polling} <b data-part="clock">{remaining}</b></span></>
                                    : <><span className="pay-check-foot-txt">{L.pollingEnded}</span><button type="button" className="pay-check-retry" data-act="retry" onClick={c.retryClaimCheck}><Glyph icon="search" /> {L.retry}</button></>}
                                {changeLink}
                            </div>
                        )}
                    </div>
                    {payNow}
                    {(showContinue || payingBank) && continueBtn(payingBank)}
                    {waHelp(L.waMissingText, L.waMissingStrong)}
                </div>
            );
        }
        return (
            <div className="pay-check info">
                <div className="pay-check-card">
                    <div className="pay-check-head">
                        <div className="pay-check-icon"><Glyph icon="stopwatch" /></div>
                        <div className="pay-check-txt">
                            <div className="pay-check-ttl">{claim.failed ? L.neutralFailedTitle : L.neutralTitle}</div>
                            <div className="pay-check-sub">{L.neutralSub}</div>
                        </div>
                    </div>
                    {(claim.failed || changeLink) && (
                        <div className={`pay-check-foot${claim.failed ? ' ended' : ''}`}>
                            {claim.failed
                                ? <><span className="pay-check-foot-txt">{L.neutralFailedFoot}</span><button type="button" className="pay-check-retry" data-act="retry" onClick={c.retryClaimCheck}><Glyph icon="search" /> {L.retry}</button></>
                                : <span className="pay-check-foot-txt">{L.neutralOtherNumber}</span>}
                            {changeLink}
                        </div>
                    )}
                </div>
                {payNow}
                {continueBtn(true)}
                {waHelp(L.waFormText, L.waFormStrong)}
            </div>
        );
    };

    const popup = (
        <div className="bd-pay">
            <div className="pay-overlay">
                <div className="pay-modal" style={{ '--pm-color': activePm.color, '--pm-soft': activePm.soft } as React.CSSProperties}>
                    {/* The card is a fixed box and THIS is what scrolls inside it.
                        Two reasons they are separate: an absolutely positioned layer
                        inside a scroller scrolls away with the content, so the close
                        confirmation below could not cover the card — and
                        keyboard-aware.js needs a real scroller here to lift the
                        reference field clear of the keyboard. */}
                    <div className="pay-scroll">
                        {/* Brand Header */}
                        <div className="pay-header">
                            <button type="button" className="pay-close" onClick={c.requestClose} title="বন্ধ করুন">
                                <Fa icon="xmark" />
                            </button>
                            <div className={`pay-logo-box${payingBank ? ' bank' : ''}`}>
                                {isWalletMethod(activePm.key) ? <img src={logoOf(activePm.key)} alt={activePm.label} /> : <BankTileIcon />}
                            </div>
                            <div className="pay-header-text">
                                <div className="pay-title">
                                    {payingBank
                                        ? <>{L.titleBank(activePm.bn)}</>
                                        : <>{L.titleWallet(activePm.bn)} <span>{L.titleWalletTag}</span></>}
                                </div>
                            </div>
                        </div>

                        <div className="pay-body">
                            {/* Method switcher — change bKash/Nagad/Rocket without closing;
                                gone once the check is running. Bank is not a wallet and
                                gets no tab: it is entered from the picker and left the same way. */}
                            {!payingBank && !claim && walletTabs.length > 1 && (
                                <div className="pay-switch">
                                    {walletTabs.map(pm => (
                                        <button key={pm.key} type="button"
                                            className={`pay-switch-btn${payUi.method === pm.key ? ' active' : ''}`}
                                            data-tab={pm.key}
                                            style={{ '--pm-color': pm.color, '--pm-soft': pm.soft } as React.CSSProperties}
                                            onClick={() => c.switchMethod(pm.key)}>
                                            <img src={logoOf(pm.key as 'bkash' | 'nagad' | 'rocket')} alt={pm.label} /> {pm.bn}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* ── The form: where to send, then the number it came from.
                                One screen, top to bottom in the order of the doing: the
                                amount, the number to copy, the three steps, then the field
                                and the check. The field is not focused on arrival — the
                                keyboard would cover the number they came here to copy. ── */}
                            {!claim && (
                                <>
                                    <div className="pay-amount-box">
                                        <div className="pay-amount-icon"><Fa icon="wallet" /></div>
                                        <span className="pay-amount-label">{L.amountLabel}{amountTag ? ` (${amountTag})` : ''}</span>
                                        <span className="pay-amount">{amountLabel}</span>
                                    </div>

                                    {receiverBlock()}

                                    <div className="pay-label"><Fa icon="list-check" /> {L.howTo}</div>
                                    <div className="pay-steps">
                                        <div className="pay-step"><span className="pay-step-num">১</span><span>{payingBank ? <>উপরের <strong>অ্যাকাউন্ট নম্বর</strong> কপি করুন</> : <>উপরের নম্বরটি <strong>কপি</strong> করুন</>}</span></div>
                                        <div className="pay-step"><span className="pay-step-num">২</span><span>{payingBank ? <>ব্যাংক অ্যাপ / ব্রাঞ্চ থেকে <strong>{formatTaka(price)} টাকা ট্রান্সফার</strong> করুন</> : <>{activePm.bn} অ্যাপ থেকে <strong>{formatTaka(price)} টাকা Send Money</strong> করুন</>}</span></div>
                                        <div className="pay-step"><span className="pay-step-num">৩</span><span>{payingBank ? <>পাঠানো হলে নিচে <strong>রেফারেন্স</strong> লিখে জমা দিন</> : payUi.method === 'rocket' ? <>পাঠানো হলে নিচে <strong>TrxID</strong> লিখে যাচাই করুন</> : <>পাঠানো হলে নিচে <strong>পাঠানোর নম্বরটি</strong> লিখে যাচাই করুন</>}</span></div>
                                    </div>

                                    {/* Sender number / TrxID input. The label names the wallet:
                                        "the bKash number you sent from" is the one phrase that
                                        is both plain and exact — it is not "your number" when
                                        the money went from someone else's wallet. */}
                                    <div className="pay-label">
                                        <Fa icon={trx ? 'lock' : 'phone-volume'} />
                                        {payingBank ? L.fieldBank : payUi.method === 'rocket' ? L.fieldRocket : L.fieldWallet(activePm.bn)}
                                    </div>
                                    <input
                                        className="pay-input"
                                        type={trx ? 'text' : 'tel'}
                                        value={payUi.value}
                                        {...c.payRefIme}
                                        onKeyDown={submitOnEnter(c.submit)}
                                        inputMode={trx ? 'text' : 'numeric'}
                                        /* What the keyboard is told about this field, so it opens
                                           in the right shape the first time: a done key that
                                           submits; caps lock on for a TrxID (they are upper-case
                                           codes, and a keyboard that autocorrects "9AB7" into a
                                           word is a reference nobody can match); and no autofill
                                           menu on any method. For bKash/Nagad the phone used to
                                           offer its own number here, which is the wrong number
                                           whenever the money went from someone else's wallet —
                                           a family member's, as often as not — and the matcher
                                           then looks the payment up under a number that never
                                           paid. The number has to be typed from memory of the
                                           sending, like the TrxID. */
                                        enterKeyHint="done"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        autoCapitalize={trx ? 'characters' : 'off'}
                                        maxLength={payingBank ? 40 : undefined}
                                        placeholder={payingBank ? L.placeholderBank : payUi.method === 'rocket' ? L.placeholderRocket : L.placeholderWallet}
                                    />

                                    {c.payError && (
                                        <div className="pay-error"><Fa icon="circle-exclamation" /> {c.payError}</div>
                                    )}

                                    <button type="button" className="pay-submit" data-act="submit" onClick={c.submit}>
                                        {payingBank ? L.submitBank : <>{L.submit} <Glyph icon="search" className="pay-btn-icon" /></>}
                                    </button>

                                    {waHelp(L.waFormText, L.waFormStrong)}
                                </>
                            )}

                            {/* ── The answer. ── */}
                            {claim && claimPanel()}
                        </div>
                    </div>

                    {/* Closing asks first — a stray tap must not discard a
                        half-typed reference for money already sent. */}
                    {c.confirmingClose && (
                        <div className="pay-confirm">
                            <div className="pay-confirm-box">
                                <p className="pay-confirm-ttl">{L.confirmTitle}</p>
                                <p className="pay-confirm-msg">{L.confirmMsg}</p>
                                <div className="pay-confirm-row">
                                    <button type="button" className="pay-confirm-yes" onClick={c.closePopup}>{L.confirmYes}</button>
                                    <button type="button" className="pay-confirm-no" onClick={c.cancelClose}>{L.confirmNo}</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const target = portalTarget === undefined ? (typeof document !== 'undefined' ? document.body : null) : portalTarget;
    return target ? createPortal(popup, target) : popup;
};

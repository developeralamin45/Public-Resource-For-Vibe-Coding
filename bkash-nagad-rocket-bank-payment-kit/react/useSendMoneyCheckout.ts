/**
 * The checkout's state, in one hook — a line-for-line port of the handlers
 * on the production landing page, with the project-specific parts (the
 * server, analytics, navigation) as callbacks.
 *
 * <SendMoneyCheckout> is this hook plus the picker, the sticky bar and the
 * popup. A project that has its own method picker uses the hook directly
 * and renders <SendMoneyPopup checkout={...}> alone.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    availableMethods, isTrxMethod, isWalletMethod, leadStageRank,
    bankCopyText, sanitizeBankRef, validateBankRef,
    getStoredLead, saveStoredLead, getPayUi, savePayUi, clearPayUi,
    getPaymentInfo, savePaymentInfo, clearPaymentInfo,
    CLAIM_POLL_MS, CLAIM_WINDOW_MS, CLAIM_CONTINUE_AFTER_MS, PAYMENT_METHODS,
} from './payment';
import type {
    PaymentConfig, PaymentMethod, PaymentClaim, ClaimCheck, PaymentInfo, PayUiState, LandingLead, LeadStage,
} from './payment';
import { sanitizePhoneInput, validateBdPhone, isValidBdPhone } from './bdPhone';
import { useImeInput } from './useImeInput';
import { mergeLabels } from './labels';
import type { CheckoutLabels } from './labels';

/** Analytics the checkout reports. Never `Purchase` — see RECIPE.md §6. */
export type TrackEvent = 'InitiateCheckout' | 'AddPaymentInfo' | 'Contact';

export interface CheckoutOptions {
    /** What the visitor is told to send. */
    amount: number;
    /** Merchant numbers and bank account, from YOUR server. */
    config: PaymentConfig;
    /** Namespaces the refresh-restore storage; one per distinct checkout (an order id, a plan). */
    popupKey?: string;
    /** Ask for a name and phone before the popup opens (default true). Off for a signed-in buyer. */
    askLead?: boolean;
    /** Record the visitor at a point in the funnel — fired while they type, when the popup opens, at submit. */
    onLead?: (lead: LandingLead, stage: LeadStage, extra: { method: PaymentMethod; amount: number; reference?: string; whatsapp?: boolean }) => void | Promise<void>;
    /** Record the claim on YOUR server. Throw (with a Bangla message) to show it under the field and keep the form. */
    onSubmit?: (claim: PaymentClaim) => Promise<void>;
    /** "Did the money arrive?" — ask YOUR server (server/CONTRACT.md). Absent: the popup says "being checked" and offers to continue. */
    checkClaim?: (claim: PaymentClaim) => Promise<ClaimCheck>;
    /** The claim is on record (found, or continued unverified): navigate on. */
    onSuccess: (info: PaymentInfo) => void;
    /** Pixel/analytics seam. */
    onTrack?: (event: TrackEvent, params: Record<string, unknown>) => void;
    /** The popup is opening — pause a video, close a menu. */
    onOpen?: () => void;
    /** Every string, overridable — see labels.ts. */
    labels?: Partial<CheckoutLabels>;
}

export type ClaimPhase = 'checking' | 'found' | 'missing' | 'neutral';
export interface ClaimState { phase: ClaimPhase; startedAt: number; polling: boolean; result: ClaimCheck | null; failed: boolean }

export function useSendMoneyCheckout(opts: CheckoutOptions) {
    const { amount, config, onSuccess } = opts;
    const popupKey = opts.popupKey || 'default';
    const askLead = opts.askLead !== false;
    const labels = useMemo(() => mergeLabels(opts.labels), [opts.labels]);
    const methods = useMemo(() => availableMethods(config), [config]);
    const bank = config.bank || null;

    // ── Payment flow state ──
    const [selectedMethod, setSelectedMethodState] = useState<PaymentMethod>(() => getPayUi(popupKey)?.method || methods[0]?.key || 'bkash');
    const [payUi, setPayUi] = useState<PayUiState | null>(() => getPayUi(popupKey));
    const [done, setDone] = useState<PaymentInfo | null>(() => getPaymentInfo(popupKey));
    const [payError, setPayError] = useState('');
    const [copied, setCopied] = useState(false);
    // Bank has no single number to copy — its button hands over every row at
    // once, so it needs a "copied" flag of its own.
    const [copiedAll, setCopiedAll] = useState(false);
    // Closing asks first: a stray tap on ✕ must not discard a half-typed
    // sender number for money the buyer has already sent.
    const [confirmingClose, setConfirmingClose] = useState(false);

    // A method the merchant no longer offers (the admin cleared it) must not
    // hold a restored popup with nothing to send money to.
    useEffect(() => {
        if (!methods.length) return;
        if (!methods.some(m => m.key === selectedMethod)) setSelectedMethodState(methods[0].key);
        setPayUi(prev => (prev && !methods.some(m => m.key === prev.method) ? null : prev));
    }, [methods, selectedMethod]);

    // ── "Did the money arrive?" ──
    // After the number is typed the popup asks the server whether a payment
    // from it is waiting, and keeps asking every few seconds for two
    // minutes. The answer only informs — see the panel — and nothing here
    // fires a Purchase: that is the server's, when the money is confirmed.
    //   checking  the first answer has not come back yet
    //   found     the money is in → onSuccess
    //   missing   not yet; polling while `polling`, then a "check again"
    //   neutral   the server cannot know (verifier off/silent, throttled,
    //             or the call failed) — say "being checked", never "not paid"
    const [claim, setClaim] = useState<ClaimState | null>(null);
    // Generation counter: a poll that lands after "change number" or ✕ is a
    // stale answer to a question no longer asked.
    const claimRun = useRef(0);
    const claimTimer = useRef<number | null>(null);
    // Re-renders once a second while looking, for the countdown.
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!claim?.polling) return;
        const id = window.setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, [claim?.polling]);
    useEffect(() => () => { if (claimTimer.current) clearTimeout(claimTimer.current); }, []);

    // ── Who the order is for ──
    // Asked before the payment method. Two reasons it is here rather than in
    // the payment popup:
    //   1. Being asked for a name makes sending money feel like placing an
    //      order instead of firing cash at a number with nothing in return.
    //   2. It is the only record of a visitor who leaves without paying.
    const [storedLead] = useState(getStoredLead);
    const [leadName, setLeadName] = useState(storedLead?.name || '');
    const [leadPhone, setLeadPhone] = useState(() => sanitizePhoneInput(storedLead?.phone || ''));
    const [leadError, setLeadError] = useState<'name' | 'phone' | null>(null);
    // Typed on a Bangla keyboard as often as not, so it normalizes on commit
    // rather than on every keystroke — see useImeInput.
    const leadPhoneIme = useImeInput(sanitizePhoneInput, value => {
        setLeadPhone(value);
        setLeadError(prev => (prev === 'phone' ? null : prev));
    });
    // What the server was last told, so retyping the same thing is not a write.
    const lastSentLead = useRef('');
    // The furthest point this visitor has reached. The server keeps the
    // furthest stage too, but holding it here as well means the typing
    // debounce cannot land after a payment and report `typed` on top of it.
    const leadStage = useRef<LeadStage>('typed');

    const optsRef = useRef(opts);
    optsRef.current = opts;

    /**
     * Record this visitor at a named point in the funnel. Best effort in
     * every direction: no usable number means nothing to record, and a
     * write that fails must never interrupt the funnel — forgetting the
     * fingerprint is the retry.
     *
     * [phoneFallback] is for the popup, where the sender number is itself a
     * phone: a visitor who skipped the name field is still worth calling.
     * [whatsapp] marks a tap on the WhatsApp link — not a stage, never
     * deduplicated.
     */
    const pushLead = useCallback((stage: LeadStage, phoneFallback?: string, reference?: string, whatsapp?: boolean) => {
        const phone = isValidBdPhone(leadPhone)
            ? leadPhone
            : (phoneFallback && isValidBdPhone(phoneFallback) ? phoneFallback : '');
        if (!phone) return;
        if (leadStageRank(stage) > leadStageRank(leadStage.current)) leadStage.current = stage;
        const name = leadName.trim().slice(0, 60);
        const lead = { name, phone };
        const extra = { method: selectedMethod, amount, ...(reference ? { reference } : {}), ...(whatsapp ? { whatsapp: true } : {}) };
        const fingerprint = JSON.stringify({ lead, stage: leadStage.current, extra });
        if (!whatsapp && fingerprint === lastSentLead.current) return;
        if (!whatsapp) lastSentLead.current = fingerprint;
        saveStoredLead(lead);
        const cb = optsRef.current.onLead;
        if (!cb) return;
        Promise.resolve()
            .then(() => cb(lead, leadStage.current, extra))
            .catch(err => {
                if (!whatsapp) lastSentLead.current = '';
                console.warn('[lead] capture failed', err);
            });
    }, [leadName, leadPhone, selectedMethod, amount]);

    // Fires while they type — NOT on submit. Someone who fills this in and
    // then leaves is exactly the person the record exists for, and they never
    // press anything.
    useEffect(() => {
        if (!askLead || !isValidBdPhone(leadPhone)) return;
        const timer = setTimeout(() => pushLead('typed'), 700);
        return () => clearTimeout(timer);
    }, [askLead, leadPhone, pushLead]);

    /** The canonical form of whatever the popup's reference field is holding:
     *  a sender number for bKash/Nagad, a TrxID for Rocket, a bank reference
     *  for bank. Idempotent, so it is safe to run again at submit — which is
     *  what catches the paste whose compositionend never fired. */
    const normalizePayRef = useCallback((raw: string): string => {
        if (payUi?.method === 'bank') return sanitizeBankRef(raw);
        if (payUi?.method === 'rocket') return raw.replace(/\s+/g, '').toUpperCase();
        return sanitizePhoneInput(raw);
    }, [payUi?.method]);

    const payRefIme = useImeInput(normalizePayRef, value => {
        setPayError('');
        setPayUi(prev => (prev ? { ...prev, value } : prev));
    });

    const activePm = payUi ? PAYMENT_METHODS.find(m => m.key === payUi.method) || null : null;
    const donePm = done ? PAYMENT_METHODS.find(m => m.key === done.method) || null : null;
    const payingBank = payUi?.method === 'bank';
    const walletReceiver = payUi && isWalletMethod(payUi.method) ? (config[payUi.method] || '') : '';

    // Persist popup state so refresh/app-switch never loses it
    useEffect(() => {
        if (payUi) savePayUi(popupKey, payUi);
        else clearPayUi(popupKey);
    }, [payUi, popupKey]);

    // Lock background scroll while the popup is open: the buyer leaves to the
    // wallet app and comes back — the page must not have scrolled away.
    useEffect(() => {
        if (!payUi) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [payUi]);

    /** Whatever the popup was asking the server, it is not asking any more. */
    const stopClaim = () => {
        claimRun.current += 1;
        if (claimTimer.current) { clearTimeout(claimTimer.current); claimTimer.current = null; }
    };

    const initiateCheckoutFired = useRef(false);

    const openPopup = (method: PaymentMethod) => {
        if (!methods.some(m => m.key === method)) return;
        optsRef.current.onOpen?.();
        setPayError('');
        setCopied(false);
        setCopiedAll(false);
        setConfirmingClose(false);
        // The reference field starts empty, whatever they typed above. Seeded
        // with the order form's phone it turned the popup into one tap:
        // number already there, Submit, done — with no money sent. Typing the
        // number the money came from is the one act that has to follow the
        // sending, so it is the one act this form does not do for them.
        stopClaim();
        setClaim(null);
        setSelectedMethodState(method);
        setPayUi(prev => (prev && prev.method === method) ? prev : { method, value: '' });
        if (!initiateCheckoutFired.current) {
            initiateCheckoutFired.current = true;
            optsRef.current.onTrack?.('InitiateCheckout', { value: amount, currency: 'BDT', num_items: 1, payment_method: method });
        }
        // They have now seen the number to send money to. Whoever stops here
        // is the most valuable call you can make — intent was real, only the
        // last step is missing.
        pushLead('checkout');
    };

    // The ✕ only ASKS. Nothing is discarded until the buyer says so.
    const requestClose = () => setConfirmingClose(true);
    const cancelClose = () => setConfirmingClose(false);

    const closePopup = () => {
        setConfirmingClose(false);
        stopClaim();
        setClaim(null);
        setPayUi(null);
        setPayError('');
    };

    /** "Sent from another number": the form again, the number kept for editing. */
    const changeClaimNumber = () => {
        stopClaim();
        setClaim(null);
        setPayError('');
    };

    /** Wallet tabs inside the popup: balance short in bKash? Switch to Nagad
     *  without closing; the typed number survives. */
    const switchMethod = (method: PaymentMethod) => {
        if (!payUi || payUi.method === method || !methods.some(m => m.key === method)) return;
        setPayError('');
        setCopied(false);
        setSelectedMethodState(method);
        setPayUi({ ...payUi, method });
    };

    const copyText = (text: string) => {
        const legacy = () => {
            const i = document.createElement('textarea');
            i.value = text; i.setAttribute('readonly', ''); i.style.position = 'fixed'; i.style.opacity = '0';
            document.body.appendChild(i); i.select();
            try { document.execCommand('copy'); } catch { /* ignore */ }
            document.body.removeChild(i);
        };
        try {
            if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(legacy);
            else legacy();
        } catch { legacy(); }
    };

    const copyNumber = () => {
        if (!payUi || !isWalletMethod(payUi.method)) return;
        copyText(config[payUi.method] || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Copying a bank account field by field is the exception, not the rule —
    // one tap takes the whole thing, labels included.
    const copyBank = () => {
        if (!bank) return;
        copyText(bankCopyText(bank));
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
    };

    const claimFor = (method: PaymentMethod, reference: string): PaymentClaim => ({
        method, reference, amount, popupKey,
        lead: { name: leadName.trim().slice(0, 60), phone: isValidBdPhone(leadPhone) ? leadPhone : '' },
    });

    /** The claim, on record for the host — then onSuccess. */
    const finishClaim = (method: PaymentMethod, reference: string, res: ClaimCheck | null) => {
        const info: PaymentInfo = {
            method, reference, submittedAt: new Date().toISOString(), amount,
            verified: !!res?.found,
            ...(res?.found ? { verifiedAmount: res.amount } : {}),
        };
        savePaymentInfo(popupKey, info);
        setDone(info);
        const leave = () => {
            stopClaim();
            setClaim(null);
            setPayUi(null);
            clearPayUi(popupKey);
        };
        if (res?.found) {
            // A moment with the green tick: a page that jumps the instant it
            // says "received" reads as though it had not.
            window.setTimeout(() => { leave(); onSuccess(info); }, 1400);
        } else {
            leave();
            onSuccess(info);
        }
    };

    /**
     * Ask, and keep asking. One answer for bank (nothing relays a bank
     * credit within minutes — the admin reads the statement); for the
     * wallets, every CLAIM_POLL_MS until CLAIM_WINDOW_MS, since the SMS
     * behind a payment made a moment ago can still be on its way.
     *
     * No checkClaim on the host: the answer is "being checked", which is the
     * truth, and the panel offers the number again and a way to continue.
     */
    const startClaimCheck = (method: PaymentMethod, reference: string, afterSubmit?: () => Promise<void>) => {
        stopClaim();
        const gen = claimRun.current;
        const startedAt = Date.now();
        setClaim({ phase: 'checking', startedAt, polling: false, result: null, failed: false });
        const check = optsRef.current.checkClaim;
        const ask = async () => {
            let res: ClaimCheck | null = null;
            if (check) {
                try { res = await check(claimFor(method, reference)); }
                catch (err) { console.warn('[claim] check failed', err); }
            } else {
                res = { found: false, verifier: 'off' };
            }
            if (gen !== claimRun.current) return;
            if (res?.found) {
                setClaim({ phase: 'found', startedAt, polling: false, result: res, failed: false });
                finishClaim(method, reference, res);
                return;
            }
            if (!res || res.throttled || res.verifier) {
                setClaim({ phase: 'neutral', startedAt, polling: false, result: res, failed: !res });
                return;
            }
            const over = method === 'bank' || Date.now() - startedAt >= CLAIM_WINDOW_MS;
            setClaim({ phase: 'missing', startedAt, polling: !over, result: res, failed: false });
            if (!over) claimTimer.current = window.setTimeout(() => { void ask(); }, CLAIM_POLL_MS);
        };
        const run = async () => {
            if (afterSubmit) {
                try { await afterSubmit(); }
                catch (err) {
                    if (gen !== claimRun.current) return;
                    // The claim could not be recorded: back to the form, the
                    // reason under the field, nothing lost.
                    setClaim(null);
                    setPayError(err instanceof Error && err.message ? err.message : labels.submitError);
                    return;
                }
                if (gen !== claimRun.current) return;
            }
            await ask();
        };
        void run();
    };

    /**
     * The number is typed: validate, record the claim (onSubmit), tell
     * analytics a payment step was taken (AddPaymentInfo — a step, not a
     * sale), and ask whether the money is in. The popup stays open for the
     * answer.
     */
    const submit = () => {
        if (!payUi) return;
        // Rocket sends a TrxID; bKash/Nagad send the number the money came
        // from — and that number is what the payment matcher looks a customer
        // up by, so it has to be a real, canonical 01XXXXXXXXX.
        let v = normalizePayRef(payUi.value).trim();
        if (payUi.method === 'bank') {
            const res = validateBankRef(v);
            if (!res.ok) { setPayError(res.error); return; }
            v = res.ref;
        } else if (payUi.method === 'rocket') {
            if (v.length !== 10) { setPayError(labels.rocketError); return; }
        } else {
            const res = validateBdPhone(v);
            if (!res.ok) { setPayError(res.error); return; }
            v = res.phone;
        }
        setPayError('');
        setPayUi(prev => (prev ? { ...prev, value: v } : prev));
        optsRef.current.onTrack?.('AddPaymentInfo', { value: amount, currency: 'BDT', num_items: 1, payment_method: payUi.method, ...(isTrxMethod(payUi.method) ? {} : { phone: v }) });
        // Says they paid. Whatever comes next, the record needs the sender
        // number to check the claim against the statement.
        pushLead('paid', isTrxMethod(payUi.method) ? undefined : v, v);
        const method = payUi.method;
        const record = optsRef.current.onSubmit;
        startClaimCheck(method, v, record ? () => record(claimFor(method, v)) : undefined);
    };

    const retryClaimCheck = () => { if (payUi) startClaimCheck(payUi.method, payUi.value); };

    /** "Continue anyway": registered as a claim; the matcher activates whatever the payment was for whenever the SMS lands. */
    const continueUnverified = () => {
        if (!payUi) return;
        finishClaim(payUi.method, payUi.value, claim?.result ?? null);
    };

    /** From the done card: look again for a claim that was not found the first time. */
    const recheckDone = () => {
        if (!done) return;
        optsRef.current.onOpen?.();
        setPayError('');
        setCopied(false);
        setCopiedAll(false);
        setConfirmingClose(false);
        setPayUi({ method: done.method, value: done.reference });
        startClaimCheck(done.method, done.reference);
    };

    /** The done card's "pay another way": forget the claim. */
    const reset = () => {
        clearPaymentInfo(popupKey);
        setDone(null);
    };

    /**
     * Send the visitor to the field they skipped. `preventScroll` first,
     * then scroll by hand: focusing inside the click keeps the gesture that
     * lets a phone open its keyboard, while the browser's own focus-scroll
     * would land the field wherever it likes — usually at the very bottom
     * edge, under the keyboard it just opened. 'start', not 'center': the
     * field's scroll-margin-top puts it inside the band keyboard-aware.js
     * treats as safe. Instant, not smooth: a page still gliding when the kit
     * takes its first look is a page it must not touch.
     */
    const focusLeadField = (id: 'bdpay-lead-name' | 'bdpay-lead-phone') => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'start' });
    };

    const requireLead = (): boolean => {
        if (!askLead) return true;
        if (leadName.trim().length < 2) { setLeadError('name'); focusLeadField('bdpay-lead-name'); return false; }
        if (!isValidBdPhone(leadPhone)) { setLeadError('phone'); focusLeadField('bdpay-lead-phone'); return false; }
        setLeadError(null);
        return true;
    };

    // Main CTA: claim already on record → onSuccess again; otherwise → the
    // name and number first, then the popup.
    const cta = () => {
        if (done) { onSuccess(done); return; }
        if (!requireLead()) return;
        openPopup(selectedMethod);
    };

    const whatsappTap = (placement: 'bubble' | 'popup') => {
        optsRef.current.onTrack?.('Contact', { value: amount, currency: 'BDT', contact_method: 'whatsapp', placement, ...(isValidBdPhone(leadPhone) ? { phone: leadPhone } : {}) });
        pushLead(leadStage.current, undefined, undefined, true);
    };

    const onLeadNameChange = (value: string) => {
        setLeadName(value);
        setLeadError(prev => (prev === 'name' ? null : prev));
    };

    return {
        // config
        amount, config, bank, methods, popupKey, askLead, labels,
        // page state
        selectedMethod, setSelectedMethod: setSelectedMethodState, done, donePm,
        leadName, leadPhone, leadError, leadPhoneIme, onLeadNameChange,
        // popup state
        payUi, activePm, payingBank, walletReceiver, payError, copied, copiedAll, confirmingClose, claim,
        payRefIme,
        // actions
        openPopup, requestClose, cancelClose, closePopup, changeClaimNumber, switchMethod,
        copyNumber, copyBank, submit, retryClaimCheck, continueUnverified, recheckDone, reset, cta, whatsappTap,
        onSuccess,
        // the clock the answer panel shows
        claimTiming: claim ? {
            remainingMs: Math.max(0, CLAIM_WINDOW_MS - (Date.now() - claim.startedAt)),
            showContinue: !claim.polling || Date.now() - claim.startedAt >= CLAIM_CONTINUE_AFTER_MS,
        } : null,
    };
}

export type SendMoneyCheckoutState = ReturnType<typeof useSendMoneyCheckout>;

/* ====================================================================
   bKash · Nagad · Rocket · Bank — send-money checkout (vanilla master copy)

   The whole flow of the production landing page, in plain JS for any
   stack: the section heading, name + phone, the four method tiles, the
   sticky pay button, the popup with its one form and its answer, the done
   card, the WhatsApp bubble. Same DOM, same class names and same logic as
   react/ — checkout.css draws both.

   Load, in this order, once per page:
     <link rel="stylesheet" href="checkout.css">
     <script src="bd-phone.js"></script>
     <script src="send-money-checkout.js"></script>
     <script src="keyboard-aware.js"></script>   (anywhere on the page, once)

   Then:
     var checkout = SendMoneyCheckout.mount(document.getElementById('pay'), {
       amount: 2950,
       config: { bkash: '017…', nagad: '018…', rocket: '019…', bank: {…} | null },
       popupKey: 'annual',
       onSubmit:   function (claim) { return fetch('/api/payment-claim', …) },
       checkClaim: function (claim) { return fetch('/api/payment-claim/check', …).then(r => r.json()) },
       onSuccess:  function (info)  { location.href = '/register'; },
       onLead, onTrack, onOpen, support, labels …   (see RECIPE.md §5)
     });
     checkout.pay() / checkout.open('bkash') / checkout.reset() / checkout.destroy()

   Everything is the production behaviour, including the parts a screenshot
   cannot show: the reference field starts EMPTY on every open (never
   prefilled — typing the number the money came from is the one act that
   has to follow the sending), nothing is written to an input mid-IME-
   composition, the keyboard's enter key submits, closing asks first, a
   refresh reopens the popup where it was, and no Purchase is ever fired
   from here. Read RECIPE.md §7 before changing any of that.
   ==================================================================== */
(function () {
    'use strict';

    /* ── Vocabulary (react/payment.ts) ────────────────────────────── */
    var METHODS = [
        { key: 'bkash', label: 'bKash', bn: 'বিকাশ', color: '#E2136E', soft: '#FFF0F7' },
        { key: 'nagad', label: 'Nagad', bn: 'নগদ', color: '#F05829', soft: '#FFF4F0' },
        { key: 'rocket', label: 'Rocket', bn: 'রকেট', color: '#8B3FA8', soft: '#F8F0FF' },
        { key: 'bank', label: 'Bank', bn: 'ব্যাংক', color: '#2563EB', soft: '#EAF1FE' }
    ];
    var CLAIM_POLL_MS = 8000;
    var CLAIM_WINDOW_MS = 120000;
    var CLAIM_CONTINUE_AFTER_MS = 30000;
    var BANK_REF_RE = /^[A-Za-z0-9/-]{4,40}$/;

    function isWallet(m) { return m !== 'bank'; }
    function isTrx(m) { return m === 'rocket' || m === 'bank'; }
    function meta(key) { for (var i = 0; i < METHODS.length; i++) if (METHODS[i].key === key) return METHODS[i]; return null; }

    /* A bank account is only offerable once all three mandatory rows are
       filled. Both spellings, so a snake_case settings row works too. */
    function bankFrom(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var str = function (v) { return typeof v === 'string' ? v.trim() : ''; };
        var b = {
            bankName: str(raw.bankName) || str(raw.bank_name),
            accountName: str(raw.accountName) || str(raw.account_name),
            accountNumber: str(raw.accountNumber) || str(raw.account_number),
            branch: str(raw.branch),
            routingNumber: str(raw.routingNumber) || str(raw.routing_number)
        };
        if (!b.bankName || !b.accountName || !b.accountNumber) return null;
        return b;
    }
    function bankRows(bank) {
        return [
            { label: 'ব্যাংক', value: bank.bankName, mono: false },
            { label: 'অ্যাকাউন্ট হোল্ডার', value: bank.accountName, mono: false },
            { label: 'অ্যাকাউন্ট নম্বর', value: bank.accountNumber, mono: true },
            { label: 'ব্রাঞ্চ', value: bank.branch || '', mono: false },
            { label: 'রাউটিং নম্বর', value: bank.routingNumber || '', mono: true }
        ].filter(function (r) { return !!r.value; });
    }
    function bankCopyText(bank) { return bankRows(bank).map(function (r) { return r.label + ': ' + r.value; }).join('\n'); }
    function sanitizeBankRef(raw) { return String(raw || '').replace(/[^A-Za-z0-9/-]/g, '').toUpperCase().slice(0, 40); }
    function validateBankRef(raw) {
        var ref = sanitizeBankRef(String(raw || '').trim());
        if (!ref) return { ok: false, error: 'ট্রানজেকশন আইডি / রেফারেন্স লিখুন।' };
        if (!BANK_REF_RE.test(ref)) return { ok: false, error: 'সঠিক ট্রানজেকশন আইডি / রেফারেন্স দিন (৪–৪০ অক্ষর)।' };
        return { ok: true, ref: ref };
    }

    /* ── Every word (react/labels.ts) ─────────────────────────────── */
    var LABELS = {
        heading: 'পেমেন্ট মেথড সিলেক্ট করুন',
        leadName: 'আপনার নাম',
        leadPhone: 'আপনার ফোন নাম্বার',
        leadNameError: 'আপনার নাম লিখুন',
        leadPhoneError: 'সঠিক মোবাইল নাম্বার দিন — যেমন ০১৭XXXXXXXX',
        ctaPay: function (amount) { return BdPhone.formatTaka(amount) + ' টাকা পেমেন্ট করুন'; },
        ctaDone: 'রেজিস্ট্রেশন সম্পন্ন করুন',
        doneVerifiedTitle: 'পেমেন্ট পাওয়া গেছে ✓',
        doneTitle: 'পেমেন্ট তথ্য জমা হয়েছে',
        doneNote: 'টাকাটা এখনো পৌঁছায়নি — পৌঁছালেই অ্যাকাউন্ট চালু হয়ে যাবে।',
        doneRecheck: 'পাঠিয়েছি, আবার দেখুন',
        doneButton: 'রেজিস্ট্রেশন সম্পন্ন করুন',
        doneReset: 'অন্য মেথডে আবার দিতে চান?',
        titleWallet: function (bn) { return bn + ' সেন্ড মানি করুন'; },
        titleWalletTag: '(পার্সোনাল)',
        titleBank: function (bn) { return bn + ' ট্রান্সফার করুন'; },
        amountLabel: 'মোট পরিমাণ',
        receiverWallet: 'যে নম্বরে টাকা পাঠাবেন',
        receiverBank: 'যে অ্যাকাউন্টে টাকা পাঠাবেন',
        copy: 'কপি করুন',
        copied: 'কপি হয়েছে',
        copyAll: 'সব তথ্য কপি করুন',
        howTo: 'কীভাবে টাকা পাঠাবেন',
        fieldBank: 'ব্যাংকের ট্রানজেকশন আইডি / রেফারেন্স',
        fieldRocket: 'রকেটের SMS-এ পাওয়া TrxID',
        fieldWallet: function (bn) { return 'যে ' + bn + ' নম্বর থেকে টাকা পাঠালেন'; },
        placeholderBank: 'যেমন: FT26AB12CD',
        placeholderRocket: 'TrxID লিখুন',
        placeholderWallet: '01XXXXXXXXX',
        submitBank: 'জমা দিন',
        submit: 'লেনদেন যাচাই করুন',
        rocketError: 'সঠিক ১০ সংখ্যার ট্রানজেকশন আইডি লিখুন।',
        submitError: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।',
        waFormText: 'টাকা পাঠাতে সমস্যা?',
        waFormStrong: 'WhatsApp-এ লিখুন',
        waMissingText: 'মিলছে না?',
        waMissingStrong: 'WhatsApp-এ স্ক্রিনশট পাঠান',
        confirmTitle: 'পেমেন্ট বন্ধ করবেন?',
        confirmMsg: 'আপনি কি নিশ্চিত পেমেন্ট প্রক্রিয়া বন্ধ করতে চান? আপনার দেওয়া তথ্য মুছে যাবে।',
        confirmYes: 'হ্যাঁ, বন্ধ করুন',
        confirmNo: 'না, চালিয়ে যাই',
        checkingTitle: 'পেমেন্ট চেক করা হচ্ছে…',
        checkingSuffix: 'চেক করা হচ্ছে — কয়েক সেকেন্ড লাগবে।',
        foundTitle: function (amount) { return amount + ' পেয়েছি — ধন্যবাদ!'; },
        foundSub: 'এখন রেজিস্ট্রেশন করলেই অ্যাকাউন্ট চালু হয়ে যাবে।',
        foundButton: 'রেজিস্ট্রেশন করুন',
        missingTitle: 'টাকাটা এখনো পৌঁছায়নি',
        missingSubBank: 'ব্যাংক ট্রান্সফার আমরা হাতে মিলিয়ে দেখি — মিললেই অ্যাকাউন্ট চালু, SMS পাবেন।',
        missingSubWallet: 'পাঠানোর পর পৌঁছাতে ১–২ মিনিট লাগতে পারে।',
        polling: 'চেক করা হচ্ছে…',
        pollingEnded: 'এখনো পৌঁছায়নি',
        retry: 'আবার দেখুন',
        changeNumber: 'নম্বর বদলান',
        changeId: 'আইডি বদলান',
        payNowTitle: 'এখনো না পাঠিয়ে থাকলে',
        payNowNote: 'পাঠালেই অ্যাকাউন্ট চালু হয়ে যাবে',
        continueButton: 'রেজিস্ট্রেশন করে রাখুন',
        neutralTitle: 'পেমেন্ট যাচাই চলছে',
        neutralFailedTitle: 'এই মুহূর্তে চেক করা গেল না',
        neutralSub: 'পাঠিয়ে থাকলে টাকা পৌঁছানোমাত্র অ্যাকাউন্ট চালু হবে, SMS পাবেন।',
        neutralFailedFoot: 'সংযোগে সমস্যা',
        neutralOtherNumber: 'অন্য নম্বর থেকে পাঠিয়েছেন?'
    };

    /* ── Icons (react/icons.tsx): the exact lucide paths production draws ── */
    var ICONS = {
        'arrow-right': [['path', {"d":"M5 12h14"}], ['path', {"d":"m12 5 7 7-7 7"}]],
        'check': [['path', {"d":"M20 6 9 17l-5-5"}]],
        'circle-check': [['circle', {"cx":"12","cy":"12","r":"10"}], ['path', {"d":"m9 12 2 2 4-4"}]],
        'circle-exclamation': [['circle', {"cx":"12","cy":"12","r":"10"}], ['line', {"x1":"12","x2":"12","y1":"8","y2":"12"}], ['line', {"x1":"12","x2":"12.01","y1":"16","y2":"16"}]],
        'copy': [['rect', {"width":"14","height":"14","x":"8","y":"8","rx":"2","ry":"2"}], ['path', {"d":"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]],
        'credit-card': [['rect', {"width":"20","height":"14","x":"2","y":"5","rx":"2"}], ['line', {"x1":"2","x2":"22","y1":"10","y2":"10"}]],
        'hourglass': [['path', {"d":"M5 22h14"}], ['path', {"d":"M5 2h14"}], ['path', {"d":"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"}], ['path', {"d":"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"}]],
        'building-columns': [['path', {"d":"M10 18v-7"}], ['path', {"d":"M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"}], ['path', {"d":"M14 18v-7"}], ['path', {"d":"M18 18v-7"}], ['path', {"d":"M3 22h18"}], ['path', {"d":"M6 18v-7"}]],
        'list-check': [['path', {"d":"M13 5h8"}], ['path', {"d":"M13 12h8"}], ['path', {"d":"M13 19h8"}], ['path', {"d":"m3 17 2 2 4-4"}], ['path', {"d":"m3 7 2 2 4-4"}]],
        'lock': [['rect', {"width":"18","height":"11","x":"3","y":"11","rx":"2","ry":"2"}], ['path', {"d":"M7 11V7a5 5 0 0 1 10 0v4"}]],
        'pencil': [['path', {"d":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"}], ['path', {"d":"m15 5 4 4"}]],
        'phone': [['path', {"d":"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"}]],
        'phone-volume': [['path', {"d":"M13 2a9 9 0 0 1 9 9"}], ['path', {"d":"M13 6a5 5 0 0 1 5 5"}], ['path', {"d":"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"}]],
        'rotate-left': [['path', {"d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}], ['path', {"d":"M3 3v5h5"}]],
        'search': [['path', {"d":"m21 21-4.34-4.34"}], ['circle', {"cx":"11","cy":"11","r":"8"}]],
        'stopwatch': [['line', {"x1":"10","x2":"14","y1":"2","y2":"2"}], ['line', {"x1":"12","x2":"15","y1":"14","y2":"11"}], ['circle', {"cx":"12","cy":"14","r":"8"}]],
        'user': [['path', {"d":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}], ['circle', {"cx":"12","cy":"7","r":"4"}]],
        'wallet': [['path', {"d":"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"}], ['path', {"d":"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"}]],
        'xmark': [['path', {"d":"M18 6 6 18"}], ['path', {"d":"m6 6 12 12"}]],
    };
    var WHATSAPP_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z';

    function svgAttrs(attrs) {
        var out = '';
        for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) out += ' ' + k + '="' + attrs[k] + '"';
        return out;
    }
    function svgNodes(name) {
        var nodes = ICONS[name] || [];
        var out = '';
        for (var i = 0; i < nodes.length; i++) out += '<' + nodes[i][0] + svgAttrs(nodes[i][1]) + '/>';
        return out;
    }
    /* <i class="fa-icon"> + a 1em SVG at stroke 2.25 — what checkout.css sizes. */
    function icon(name, cls) {
        var body = name === 'whatsapp'
            ? '<svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + WHATSAPP_PATH + '"/></svg>'
            : '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + svgNodes(name) + '</svg>';
        return '<i class="fa-icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + body + '</i>';
    }
    /* A bare glyph (no wrapper) for the answer panel's icons and the buttons
       whose SVG the stylesheet sizes directly. */
    function glyph(name, cls) {
        return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + svgNodes(name) + '</svg>';
    }
    var BANK_TILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M4 18h16M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 3 3 8h18L12 3z"/></svg>';

    /* ── Small helpers ─────────────────────────────────────────────── */
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
    function money(n) { return '৳' + Number(n).toLocaleString('en-US'); }
    function readLS(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
    function dropLS(k) { try { localStorage.removeItem(k); } catch (e) { /* silent */ } }
    function copyText(text) {
        var legacy = function () {
            var i = document.createElement('textarea');
            i.value = text; i.setAttribute('readonly', ''); i.style.position = 'fixed'; i.style.opacity = '0';
            document.body.appendChild(i); i.select();
            try { document.execCommand('copy'); } catch (e) { /* ignore */ }
            document.body.removeChild(i);
        };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(legacy);
            else legacy();
        } catch (e) { legacy(); }
    }
    function whatsappUrl(number, text) { return 'https://wa.me/' + number + (text ? '?text=' + encodeURIComponent(text) : ''); }

    /* An input that normalizes what it is given — safely, on a Bangla
       keyboard (react/useImeInput.ts). Hold the raw text while a composition
       is open; normalize the moment it commits — compositionend, or blur,
       because Facebook's WebView has been seen committing without the event. */
    function imeInput(input, normalize, commit) {
        var open = false;
        function apply(v) { if (input.value !== v) input.value = v; commit(v); }
        input.addEventListener('compositionstart', function () { open = true; });
        input.addEventListener('compositionend', function () { open = false; apply(normalize(input.value)); });
        input.addEventListener('input', function (e) { var mid = open || e.isComposing; apply(mid ? input.value : normalize(input.value)); });
        input.addEventListener('blur', function () { open = false; apply(normalize(input.value)); });
    }
    /* The keyboard's own enter key. 229 / isComposing is an IME claiming the
       keystroke to accept a candidate word: not ours. */
    function onEnter(input, fn) {
        input.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            fn();
        });
    }

    /* ── The checkout ──────────────────────────────────────────────── */
    function mount(root, opts) {
        if (!root) throw new Error('SendMoneyCheckout.mount: no element');
        if (!window.BdPhone) throw new Error('SendMoneyCheckout: load bd-phone.js first');
        opts = opts || {};
        var L = {};
        for (var k in LABELS) L[k] = LABELS[k];
        if (opts.labels) for (var k2 in opts.labels) L[k2] = opts.labels[k2];

        var amount = Number(opts.amount) || 0;
        var popupKey = opts.popupKey || 'default';
        var askLead = opts.askLead !== false;
        var config = opts.config || {};
        var bank = bankFrom(config.bank);
        var assets = (opts.assetsBase || 'assets').replace(/\/+$/, '');
        var logos = { bkash: assets + '/bkash.webp', nagad: assets + '/nagad.webp', rocket: assets + '/rocket.webp' };
        if (opts.logos) for (var lk in opts.logos) if (opts.logos[lk]) logos[lk] = opts.logos[lk];
        var support = opts.support && opts.support.whatsapp ? opts.support : null;
        var bubbleWanted = !!support && support.bubble !== false;
        var stickyCta = opts.stickyCta !== false;
        var heading = opts.heading === undefined ? L.heading : opts.heading;

        var methods = METHODS.filter(function (m) {
            return m.key === 'bank' ? !!bank : !!(typeof config[m.key] === 'string' && config[m.key].trim());
        });
        var walletTabs = methods.filter(function (m) { return isWallet(m.key); });
        function receiverOf(key) { return (config[key] || '').trim(); }

        var LS_UI = 'bdpay_ui_' + popupKey, LS_DONE = 'bdpay_done_' + popupKey, LS_LEAD = 'bdpay_lead';

        /* State — the same names as the React hook. */
        var S = {
            selected: null, payUi: null, done: null, payError: '', copied: false, copiedAll: false, confirmingClose: false,
            claim: null, leadName: '', leadPhone: '', leadError: null
        };
        var storedUi = readLS(LS_UI);
        if (storedUi && storedUi.method && methods.some(function (m) { return m.key === storedUi.method; })) {
            S.payUi = { method: storedUi.method, value: storedUi.value || '' };
        }
        S.selected = (S.payUi && S.payUi.method) || (methods[0] && methods[0].key) || 'bkash';
        var storedDone = readLS(LS_DONE);
        if (storedDone && storedDone.method && storedDone.reference) S.done = storedDone;
        var storedLead = readLS(LS_LEAD);
        if (storedLead) { S.leadName = storedLead.name || ''; S.leadPhone = BdPhone.sanitize(storedLead.phone || ''); }

        var claimRun = 0, claimTimer = null, tickTimer = null, copyTimer = null, copyAllTimer = null;
        var lastSentLead = '', leadStage = 'typed', initiateFired = false, leadTypedTimer = null;
        var STAGES = ['typed', 'checkout', 'paid'];

        /* ── Lead capture (best effort, never in the way) ── */
        function pushLead(stage, phoneFallback, reference, whatsapp) {
            var phone = BdPhone.isValid(S.leadPhone) ? S.leadPhone
                : (phoneFallback && BdPhone.isValid(phoneFallback) ? phoneFallback : '');
            if (!phone) return;
            if (STAGES.indexOf(stage) > STAGES.indexOf(leadStage)) leadStage = stage;
            var lead = { name: S.leadName.trim().slice(0, 60), phone: phone };
            var extra = { method: S.selected, amount: amount };
            if (reference) extra.reference = reference;
            if (whatsapp) extra.whatsapp = true;
            var fingerprint = JSON.stringify({ lead: lead, stage: leadStage, extra: extra });
            if (!whatsapp && fingerprint === lastSentLead) return;
            if (!whatsapp) lastSentLead = fingerprint;
            writeLS(LS_LEAD, lead);
            if (typeof opts.onLead !== 'function') return;
            Promise.resolve().then(function () { return opts.onLead(lead, leadStage, extra); })
                .catch(function (err) { if (!whatsapp) lastSentLead = ''; console.warn('[lead] capture failed', err); });
        }
        function track(event, params) { if (typeof opts.onTrack === 'function') { try { opts.onTrack(event, params); } catch (e) { /* never in the way */ } } }

        function waText(where) {
            var name = S.leadName.trim();
            var intro = name ? 'আমি ' + name + '। ' : '';
            var offer = support.offer || (BdPhone.formatTaka(amount) + ' টাকার পেমেন্ট');
            var pm = S.payUi ? meta(S.payUi.method) : null;
            return where === 'popup' && pm
                ? intro + offer + ' — ' + pm.bn + '-এ টাকা পাঠাতে গিয়ে একটু সমস্যা হচ্ছে।'
                : intro + offer + ' নিয়ে জানতে চাই।';
        }
        function waTap(where) {
            var p = { value: amount, currency: 'BDT', contact_method: 'whatsapp', placement: where };
            if (BdPhone.isValid(S.leadPhone)) p.phone = S.leadPhone;
            track('Contact', p);
            pushLead(leadStage, undefined, undefined, true);
        }

        /* ── The section ── */
        var section = document.createElement('section');
        section.className = 'bd-pay' + (opts.className ? ' ' + opts.className : '');
        root.appendChild(section);
        var leadInputs = {};

        function renderSection() {
            var html = '';
            if (heading !== null) {
                html += '<div class="dynamic-header"><div class="header-line flow-1"></div><div class="header-content">' +
                    '<div class="header-icon-wrapper">' + icon('credit-card', 'icon-grad-3') + '</div>' +
                    '<span class="gradient-text-3">' + esc(heading) + '</span></div><div class="header-line flow-1"></div></div>';
            }
            var pm = S.done ? meta(S.done.method) : null;
            if (S.done && pm) {
                html += '<div class="glass-list pay-done-card">' +
                    '<div class="pay-done-icon' + (S.done.verified ? '' : ' waiting') + '">' + icon(S.done.verified ? 'circle-check' : 'circle-exclamation') + '</div>' +
                    '<div class="pay-done-title">' + esc(S.done.verified ? L.doneVerifiedTitle : L.doneTitle) + '</div>' +
                    '<div class="pay-done-sub">' + esc(pm.bn) + ' • <strong>' + esc(S.done.reference) + '</strong>' + (opts.doneSuffix ? ' ' + esc(opts.doneSuffix) : '') + '</div>' +
                    (S.done.verified ? '' : '<div class="pay-done-note">' + esc(L.doneNote) + '<button type="button" data-act="recheck">' + icon('search') + ' ' + esc(L.doneRecheck) + '</button></div>') +
                    '<button type="button" class="pay-done-btn" data-act="success">' + esc(L.doneButton) + ' ' + icon('arrow-right') + '</button>' +
                    '<button type="button" class="pay-done-reset" data-act="reset">' + icon('rotate-left') + ' ' + esc(L.doneReset) + '</button>' +
                    '</div>';
            } else {
                html += '<div class="glass-list">';
                if (askLead) {
                    html += '<div class="lead-card">' +
                        '<div class="lead-field"><input id="bdpay-lead-name" class="lead-input" type="text" placeholder="' + esc(L.leadName) + '" autocomplete="name" enterkeyhint="next" maxlength="60" required>' +
                        '<label for="bdpay-lead-name">' + esc(L.leadName) + ' <span class="lead-req">*</span></label>' + icon('user') + '</div>' +
                        '<div class="lead-field"><input id="bdpay-lead-phone" class="lead-input" type="tel" inputmode="numeric" placeholder="' + esc(L.leadPhone) + '" autocomplete="tel" enterkeyhint="done" required>' +
                        '<label for="bdpay-lead-phone">' + esc(L.leadPhone) + ' <span class="lead-req">*</span></label>' + icon('phone') + '</div>' +
                        '</div>';
                }
                html += '<div class="pay-method-grid">';
                methods.forEach(function (m) {
                    html += '<button type="button" class="pay-method-card" data-method="' + m.key + '" style="--pm-color:' + m.color + ';--pm-soft:' + m.soft + '">' +
                        '<div class="pay-method-logo' + (m.key === 'bank' ? ' bank' : '') + '">' + (m.key === 'bank' ? BANK_TILE : '<img src="' + esc(logos[m.key]) + '" alt="' + esc(m.label) + '">') + '</div>' +
                        '<span class="pay-method-name">' + esc(m.bn) + '</span></button>';
                });
                html += '</div></div>';
            }
            section.innerHTML = html;

            if (S.done) {
                section.querySelector('[data-act="success"]').addEventListener('click', function () { opts.onSuccess && opts.onSuccess(S.done); });
                section.querySelector('[data-act="reset"]').addEventListener('click', reset);
                var rc = section.querySelector('[data-act="recheck"]');
                if (rc) rc.addEventListener('click', recheckDone);
            } else {
                if (askLead) {
                    leadInputs.name = section.querySelector('#bdpay-lead-name');
                    leadInputs.phone = section.querySelector('#bdpay-lead-phone');
                    leadInputs.name.value = S.leadName;
                    leadInputs.phone.value = S.leadPhone;
                    leadInputs.name.addEventListener('input', function () {
                        S.leadName = leadInputs.name.value;
                        if (S.leadError === 'name') setLeadError(null);
                    });
                    onEnter(leadInputs.name, function () { leadInputs.phone.focus(); });
                    imeInput(leadInputs.phone, BdPhone.sanitize, function (v) {
                        S.leadPhone = v;
                        if (S.leadError === 'phone') setLeadError(null);
                        // Fires while they type — NOT on submit. Someone who
                        // fills this in and then leaves is exactly the person
                        // the record exists for, and they never press anything.
                        clearTimeout(leadTypedTimer);
                        if (BdPhone.isValid(v)) leadTypedTimer = setTimeout(function () { pushLead('typed'); }, 700);
                    });
                    onEnter(leadInputs.phone, function () { leadInputs.phone.blur(); });
                }
                Array.prototype.forEach.call(section.querySelectorAll('.pay-method-card'), function (btn) {
                    btn.addEventListener('click', function () { S.selected = btn.getAttribute('data-method'); updatePicker(); });
                });
                updatePicker();
                setLeadError(S.leadError);
            }
            updateCta();
        }

        function updatePicker() {
            Array.prototype.forEach.call(section.querySelectorAll('.pay-method-card'), function (btn) {
                var on = btn.getAttribute('data-method') === S.selected;
                btn.classList.toggle('selected', on);
                var check = btn.querySelector('.pay-method-check');
                if (on && !check) btn.insertBefore(el('<span class="pay-method-check">' + icon('check') + '</span>'), btn.firstChild);
                if (!on && check) check.remove();
            });
        }

        function setLeadError(which) {
            S.leadError = which;
            ['name', 'phone'].forEach(function (f) {
                var input = leadInputs[f];
                if (!input) return;
                var bad = which === f;
                input.classList.toggle('invalid', bad);
                input.setAttribute('aria-invalid', bad ? 'true' : 'false');
                var field = input.parentNode;
                var p = field.querySelector('.lead-error');
                if (bad && !p) field.appendChild(el('<p class="lead-error">' + esc(f === 'name' ? L.leadNameError : L.leadPhoneError) + '</p>'));
                if (!bad && p) p.remove();
            });
        }

        /* Send the visitor to the field they skipped. preventScroll first,
           then scroll by hand, 'start' not 'center', instant not smooth —
           see the React hook for why each of those. */
        function focusLeadField(input) {
            if (!input) return;
            try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
            input.scrollIntoView({ block: 'start' });
        }
        function requireLead() {
            if (!askLead) return true;
            if (S.leadName.trim().length < 2) { setLeadError('name'); focusLeadField(leadInputs.name); return false; }
            if (!BdPhone.isValid(S.leadPhone)) { setLeadError('phone'); focusLeadField(leadInputs.phone); return false; }
            setLeadError(null);
            return true;
        }

        /* ── Sticky CTA + bubble ── */
        var ctaRoot = null, ctaLabel = null, bubbleRoot = null, bubbleLink = null, bubbleTimer = null, bubbleIo = null;
        if (stickyCta) {
            ctaRoot = el('<div class="bd-pay"><div class="sticky-cta"><button type="button" class="sticky-cta-btn"><span class="cta-shine"></span><span class="cta-label"></span><span class="cta-arrow">' + icon('arrow-right') + '</span></button></div></div>');
            document.body.appendChild(ctaRoot);
            ctaLabel = ctaRoot.querySelector('.cta-label');
            ctaRoot.querySelector('.sticky-cta-btn').addEventListener('click', cta);
        }
        function updateCta() { if (ctaLabel) ctaLabel.textContent = S.done ? L.ctaDone : L.ctaPay(amount); }

        if (bubbleWanted) {
            bubbleRoot = el('<div class="bd-pay"><a class="wa-bubble" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp-এ জিজ্ঞেস করুন" title="WhatsApp-এ জিজ্ঞেস করুন">' + icon('whatsapp') + '</a></div>');
            document.body.appendChild(bubbleRoot);
            bubbleLink = bubbleRoot.querySelector('.wa-bubble');
            bubbleLink.addEventListener('click', function () { waTap('bubble'); });
            // The bubble yields to the form: it slides out as this section
            // reaches the upper half of the screen, back in when they scroll
            // up, and waits 1.2 s after first paint.
            var settled = false, inView = false;
            var apply = function () { bubbleLink.classList.toggle('on', settled && !inView && !S.payUi); };
            bubbleTimer = setTimeout(function () { settled = true; apply(); }, 1200);
            if (typeof IntersectionObserver !== 'undefined') {
                bubbleIo = new IntersectionObserver(function (entries) {
                    for (var i = 0; i < entries.length; i++) inView = entries[i].isIntersecting;
                    apply();
                }, { rootMargin: '0px 0px -45% 0px' });
                bubbleIo.observe(section);
            }
            bubbleRoot._apply = apply;
        }
        function updateBubble() {
            if (!bubbleLink) return;
            bubbleLink.href = whatsappUrl(support.whatsapp, waText('bubble'));
            // Gone while the popup is open: the popup has its own line.
            bubbleRoot.style.display = S.payUi ? 'none' : '';
            bubbleRoot._apply();
        }

        /* ── The popup ── */
        var popupRoot = null, P = {};   // P: the popup's live elements

        function openPopup(method) {
            if (!methods.some(function (m) { return m.key === method; })) return;
            if (typeof opts.onOpen === 'function') opts.onOpen();
            S.payError = ''; S.copied = false; S.copiedAll = false; S.confirmingClose = false;
            // The reference field starts empty, whatever they typed above —
            // typing the number the money came from is the one act that has
            // to follow the sending, so it is the one act this form does not
            // do for them.
            stopClaim(); S.claim = null;
            S.selected = method; updatePicker();
            if (!(S.payUi && S.payUi.method === method)) S.payUi = { method: method, value: '' };
            persistUi();
            if (!initiateFired) {
                initiateFired = true;
                track('InitiateCheckout', { value: amount, currency: 'BDT', num_items: 1, payment_method: method });
            }
            // They have now seen the number to send money to.
            pushLead('checkout');
            renderPopup();
        }
        function persistUi() { if (S.payUi) writeLS(LS_UI, S.payUi); else dropLS(LS_UI); }

        function renderPopup() {
            destroyPopup(false);
            if (!S.payUi) return;
            var pm = meta(S.payUi.method);
            var payingBank = S.payUi.method === 'bank';
            var trx = isTrx(S.payUi.method);
            var html = '<div class="bd-pay"><div class="pay-overlay"><div class="pay-modal" style="--pm-color:' + pm.color + ';--pm-soft:' + pm.soft + '"><div class="pay-scroll">' +
                '<div class="pay-header"><button type="button" class="pay-close" title="বন্ধ করুন">' + icon('xmark') + '</button>' +
                '<div class="pay-logo-box' + (payingBank ? ' bank' : '') + '">' + (payingBank ? BANK_TILE : '<img src="' + esc(logos[pm.key]) + '" alt="' + esc(pm.label) + '">') + '</div>' +
                '<div class="pay-header-text"><div class="pay-title">' + (payingBank ? esc(L.titleBank(pm.bn)) : esc(L.titleWallet(pm.bn)) + ' <span>' + esc(L.titleWalletTag) + '</span>') + '</div></div></div>' +
                '<div class="pay-body">';
            if (!payingBank && walletTabs.length > 1) {
                html += '<div class="pay-switch" data-part="tabs">';
                walletTabs.forEach(function (t) {
                    html += '<button type="button" class="pay-switch-btn' + (t.key === S.payUi.method ? ' active' : '') + '" data-tab="' + t.key + '" style="--pm-color:' + t.color + ';--pm-soft:' + t.soft + '"><img src="' + esc(logos[t.key]) + '" alt="' + esc(t.label) + '"> ' + esc(t.bn) + '</button>';
                });
                html += '</div>';
            }
            // The form: amount, the number to copy, the three steps, the field.
            html += '<div data-part="form">' +
                '<div class="pay-amount-box"><div class="pay-amount-icon">' + icon('wallet') + '</div><span class="pay-amount-label">' + esc(L.amountLabel) + (opts.amountTag ? ' (' + esc(opts.amountTag) + ')' : '') + '</span><span class="pay-amount">' + money(amount) + '</span></div>' +
                receiverBlock(true) +
                '<div class="pay-label">' + icon('list-check') + ' ' + esc(L.howTo) + '</div>' +
                '<div class="pay-steps">' +
                '<div class="pay-step"><span class="pay-step-num">১</span><span>' + (payingBank ? 'উপরের <strong>অ্যাকাউন্ট নম্বর</strong> কপি করুন' : 'উপরের নম্বরটি <strong>কপি</strong> করুন') + '</span></div>' +
                '<div class="pay-step"><span class="pay-step-num">২</span><span>' + (payingBank ? 'ব্যাংক অ্যাপ / ব্রাঞ্চ থেকে <strong>' + BdPhone.formatTaka(amount) + ' টাকা ট্রান্সফার</strong> করুন' : esc(pm.bn) + ' অ্যাপ থেকে <strong>' + BdPhone.formatTaka(amount) + ' টাকা Send Money</strong> করুন') + '</span></div>' +
                '<div class="pay-step"><span class="pay-step-num">৩</span><span>' + (payingBank ? 'পাঠানো হলে নিচে <strong>রেফারেন্স</strong> লিখে জমা দিন' : S.payUi.method === 'rocket' ? 'পাঠানো হলে নিচে <strong>TrxID</strong> লিখে যাচাই করুন' : 'পাঠানো হলে নিচে <strong>পাঠানোর নম্বরটি</strong> লিখে যাচাই করুন') + '</span></div>' +
                '</div>' +
                '<div class="pay-label">' + icon(trx ? 'lock' : 'phone-volume') + esc(payingBank ? L.fieldBank : S.payUi.method === 'rocket' ? L.fieldRocket : L.fieldWallet(pm.bn)) + '</div>' +
                // What the keyboard is told about this field: a done key that
                // submits, caps lock for a TrxID, no autofill on any method —
                // the phone's own number is the wrong answer whenever the money
                // went from someone else's wallet.
                '<input class="pay-input" type="' + (trx ? 'text' : 'tel') + '" inputmode="' + (trx ? 'text' : 'numeric') + '" enterkeyhint="done" autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="' + (trx ? 'characters' : 'off') + '"' + (payingBank ? ' maxlength="40"' : '') + ' placeholder="' + esc(payingBank ? L.placeholderBank : S.payUi.method === 'rocket' ? L.placeholderRocket : L.placeholderWallet) + '">' +
                '<div data-part="error"></div>' +
                '<button type="button" class="pay-submit" data-act="submit">' + (payingBank ? esc(L.submitBank) : esc(L.submit) + ' ' + glyph('search', 'pay-btn-icon')) + '</button>' +
                waHelp(L.waFormText, L.waFormStrong) +
                '</div>' +
                '<div data-part="answer"></div>' +
                '</div></div></div></div></div>';
            popupRoot = el(html);
            document.body.appendChild(popupRoot);
            document.body.style.overflow = 'hidden';

            P.form = popupRoot.querySelector('[data-part="form"]');
            P.tabs = popupRoot.querySelector('[data-part="tabs"]');
            P.answer = popupRoot.querySelector('[data-part="answer"]');
            P.error = popupRoot.querySelector('[data-part="error"]');
            P.input = popupRoot.querySelector('.pay-input');
            P.modal = popupRoot.querySelector('.pay-modal');
            P.input.value = S.payUi.value;

            popupRoot.querySelector('.pay-close').addEventListener('click', requestClose);
            if (P.tabs) Array.prototype.forEach.call(P.tabs.querySelectorAll('.pay-switch-btn'), function (b) {
                b.addEventListener('click', function () { switchMethod(b.getAttribute('data-tab')); });
            });
            bindReceiver(P.form);
            imeInput(P.input, normalizeRef, function (v) { S.payUi.value = v; persistUi(); setPayError(''); });
            onEnter(P.input, submit);
            popupRoot.querySelector('[data-act="submit"]').addEventListener('click', submit);
            var wa = P.form.querySelector('.wa-help');
            if (wa) wa.addEventListener('click', function () { waTap('popup'); });

            setPayError(S.payError);
            renderAnswer();
            renderConfirm();
            updateBubble();
        }

        /* The number — or the whole bank account — the money goes to. */
        function receiverBlock(label) {
            if (S.payUi.method === 'bank') {
                if (!bank) return '';
                var rows = bankRows(bank).map(function (r) {
                    return '<div class="pay-bank-row"><span class="pay-bank-lbl">' + esc(r.label) + '</span><span class="pay-bank-val' + (r.mono ? ' mono' : '') + '">' + esc(r.value) + '</span></div>';
                }).join('');
                return (label ? '<div class="pay-label">' + icon('building-columns') + ' ' + esc(L.receiverBank) + '</div>' : '') +
                    '<div class="pay-bank">' + rows + '<button type="button" class="pay-copy-all' + (S.copiedAll ? ' copied' : '') + '" data-act="copy-all">' + icon(S.copiedAll ? 'check' : 'copy') + ' ' + esc(S.copiedAll ? L.copied : L.copyAll) + '</button></div>';
            }
            return (label ? '<div class="pay-label">' + icon('phone') + ' ' + esc(L.receiverWallet) + '</div>' : '') +
                '<div class="pay-number-box"><span class="pay-number">' + esc(receiverOf(S.payUi.method)) + '</span>' +
                '<button type="button" class="pay-copy-btn" data-act="copy">' + icon(S.copied ? 'check' : 'copy') + ' ' + esc(S.copied ? L.copied : L.copy) + '</button></div>';
        }
        function bindReceiver(scope) {
            Array.prototype.forEach.call(scope.querySelectorAll('[data-act="copy"]'), function (b) { b.addEventListener('click', copyNumber); });
            Array.prototype.forEach.call(scope.querySelectorAll('[data-act="copy-all"]'), function (b) { b.addEventListener('click', copyBank); });
        }
        function refreshCopyButtons() {
            if (!popupRoot) return;
            Array.prototype.forEach.call(popupRoot.querySelectorAll('[data-act="copy"]'), function (b) {
                b.innerHTML = icon(S.copied ? 'check' : 'copy') + ' ' + esc(S.copied ? L.copied : L.copy);
            });
            Array.prototype.forEach.call(popupRoot.querySelectorAll('[data-act="copy-all"]'), function (b) {
                b.classList.toggle('copied', S.copiedAll);
                b.innerHTML = icon(S.copiedAll ? 'check' : 'copy') + ' ' + esc(S.copiedAll ? L.copied : L.copyAll);
            });
        }
        function copyNumber() {
            if (!S.payUi || !isWallet(S.payUi.method)) return;
            copyText(receiverOf(S.payUi.method));
            S.copied = true; refreshCopyButtons();
            clearTimeout(copyTimer); copyTimer = setTimeout(function () { S.copied = false; refreshCopyButtons(); }, 2000);
        }
        function copyBank() {
            if (!bank) return;
            copyText(bankCopyText(bank));
            S.copiedAll = true; refreshCopyButtons();
            clearTimeout(copyAllTimer); copyAllTimer = setTimeout(function () { S.copiedAll = false; refreshCopyButtons(); }, 2000);
        }
        function waHelp(text, strong) {
            if (!support) return '';
            return '<a class="wa-help" href="' + esc(whatsappUrl(support.whatsapp, waText('popup'))) + '" target="_blank" rel="noopener noreferrer">' + icon('whatsapp') + '<span>' + esc(text) + ' <strong>' + esc(strong) + '</strong></span></a>';
        }

        function normalizeRef(raw) {
            if (!S.payUi) return raw;
            if (S.payUi.method === 'bank') return sanitizeBankRef(raw);
            if (S.payUi.method === 'rocket') return String(raw || '').replace(/\s+/g, '').toUpperCase();
            return BdPhone.sanitize(raw);
        }
        function setPayError(msg) {
            S.payError = msg || '';
            if (!P.error) return;
            P.error.innerHTML = S.payError ? '<div class="pay-error">' + icon('circle-exclamation') + ' ' + esc(S.payError) + '</div>' : '';
        }

        /* Wallet tabs: balance short in bKash? Switch to Nagad without
           closing; the typed number survives. */
        function switchMethod(method) {
            if (!S.payUi || S.payUi.method === method || !methods.some(function (m) { return m.key === method; })) return;
            S.payError = ''; S.copied = false;
            S.selected = method; updatePicker();
            S.payUi = { method: method, value: S.payUi.value };
            persistUi();
            renderPopup();
        }

        /* The ✕ only ASKS. Nothing is discarded until the buyer says so. */
        function requestClose() { S.confirmingClose = true; renderConfirm(); }
        function cancelClose() { S.confirmingClose = false; renderConfirm(); }
        function closePopup() {
            S.confirmingClose = false;
            stopClaim(); S.claim = null;
            S.payUi = null; persistUi();
            S.payError = '';
            destroyPopup(true);
            updateBubble();
        }
        function renderConfirm() {
            if (!popupRoot) return;
            var existing = P.modal.querySelector('.pay-confirm');
            if (existing) existing.remove();
            if (!S.confirmingClose) return;
            var box = el('<div class="pay-confirm"><div class="pay-confirm-box"><p class="pay-confirm-ttl">' + esc(L.confirmTitle) + '</p><p class="pay-confirm-msg">' + esc(L.confirmMsg) + '</p>' +
                '<div class="pay-confirm-row"><button type="button" class="pay-confirm-yes">' + esc(L.confirmYes) + '</button><button type="button" class="pay-confirm-no">' + esc(L.confirmNo) + '</button></div></div></div>');
            box.querySelector('.pay-confirm-yes').addEventListener('click', closePopup);
            box.querySelector('.pay-confirm-no').addEventListener('click', cancelClose);
            P.modal.appendChild(box);
        }
        function destroyPopup(unlock) {
            if (popupRoot) { popupRoot.remove(); popupRoot = null; }
            P = {};
            if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
            if (unlock) document.body.style.overflow = '';
        }

        /* ── The claim, and the answer ── */
        function stopClaim() {
            claimRun += 1;
            if (claimTimer) { clearTimeout(claimTimer); claimTimer = null; }
        }
        function claimFor(method, reference) {
            return {
                method: method, reference: reference, amount: amount, popupKey: popupKey,
                lead: { name: S.leadName.trim().slice(0, 60), phone: BdPhone.isValid(S.leadPhone) ? S.leadPhone : '' }
            };
        }
        function setClaim(c) { S.claim = c; renderAnswer(); }

        function submit() {
            if (!S.payUi) return;
            var v = normalizeRef(P.input ? P.input.value : S.payUi.value).trim();
            if (S.payUi.method === 'bank') {
                var b = validateBankRef(v);
                if (!b.ok) { setPayError(b.error); return; }
                v = b.ref;
            } else if (S.payUi.method === 'rocket') {
                if (v.length !== 10) { setPayError(L.rocketError); return; }
            } else {
                var p = BdPhone.validate(v);
                if (!p.ok) { setPayError(p.error); return; }
                v = p.phone;
            }
            setPayError('');
            S.payUi.value = v; if (P.input) P.input.value = v; persistUi();
            var params = { value: amount, currency: 'BDT', num_items: 1, payment_method: S.payUi.method };
            if (!isTrx(S.payUi.method)) params.phone = v;
            track('AddPaymentInfo', params);
            pushLead('paid', isTrx(S.payUi.method) ? undefined : v, v);
            var method = S.payUi.method;
            startClaimCheck(method, v, typeof opts.onSubmit === 'function' ? function () { return opts.onSubmit(claimFor(method, v)); } : null);
        }

        /* Ask, and keep asking: one answer for bank, every CLAIM_POLL_MS
           until CLAIM_WINDOW_MS for the wallets. No checkClaim on the host:
           the answer is "being checked", which is the truth. */
        function startClaimCheck(method, reference, afterSubmit) {
            stopClaim();
            var gen = claimRun;
            var startedAt = Date.now();
            setClaim({ phase: 'checking', startedAt: startedAt, polling: false, result: null, failed: false });
            var check = typeof opts.checkClaim === 'function' ? opts.checkClaim : null;
            function ask() {
                var p = check
                    ? Promise.resolve().then(function () { return check(claimFor(method, reference)); }).catch(function (err) { console.warn('[claim] check failed', err); return null; })
                    : Promise.resolve({ found: false, verifier: 'off' });
                return p.then(function (res) {
                    if (gen !== claimRun) return;
                    if (res && res.found) {
                        setClaim({ phase: 'found', startedAt: startedAt, polling: false, result: res, failed: false });
                        finishClaim(method, reference, res);
                        return;
                    }
                    if (!res || res.throttled || res.verifier) {
                        setClaim({ phase: 'neutral', startedAt: startedAt, polling: false, result: res, failed: !res });
                        return;
                    }
                    var over = method === 'bank' || Date.now() - startedAt >= CLAIM_WINDOW_MS;
                    setClaim({ phase: 'missing', startedAt: startedAt, polling: !over, result: res, failed: false });
                    if (!over) claimTimer = setTimeout(ask, CLAIM_POLL_MS);
                });
            }
            var first = afterSubmit
                ? Promise.resolve().then(afterSubmit).then(function () { if (gen === claimRun) return ask(); }, function (err) {
                    if (gen !== claimRun) return;
                    // The claim could not be recorded: back to the form, the
                    // reason under the field, nothing lost.
                    setClaim(null);
                    setPayError(err && err.message ? err.message : L.submitError);
                })
                : ask();
            void first;
        }
        function retryClaimCheck() { if (S.payUi) startClaimCheck(S.payUi.method, S.payUi.value); }
        function changeClaimNumber() { stopClaim(); setClaim(null); setPayError(''); }

        /* The claim, on record — then onSuccess. */
        function finishClaim(method, reference, res) {
            var info = { method: method, reference: reference, submittedAt: new Date().toISOString(), amount: amount, verified: !!(res && res.found) };
            if (res && res.found) info.verifiedAmount = res.amount;
            writeLS(LS_DONE, info);
            S.done = info;
            var leave = function () {
                stopClaim(); S.claim = null;
                S.payUi = null; persistUi();
                destroyPopup(true);
                renderSection(); updateBubble();
            };
            if (res && res.found) {
                // A moment with the green tick: a page that jumps the instant
                // it says "received" reads as though it had not.
                setTimeout(function () { leave(); opts.onSuccess && opts.onSuccess(info); }, 1400);
            } else {
                leave();
                opts.onSuccess && opts.onSuccess(info);
            }
        }
        function continueUnverified() { if (S.payUi) finishClaim(S.payUi.method, S.payUi.value, S.claim ? S.claim.result : null); }
        function recheckDone() {
            if (!S.done) return;
            if (typeof opts.onOpen === 'function') opts.onOpen();
            S.payError = ''; S.copied = false; S.copiedAll = false; S.confirmingClose = false;
            S.payUi = { method: S.done.method, value: S.done.reference }; persistUi();
            renderPopup();
            startClaimCheck(S.done.method, S.done.reference);
        }
        function reset() { dropLS(LS_DONE); S.done = null; renderSection(); }

        /* What the server said about the number. Every branch that is not
           "found" carries the number to send to. */
        function renderAnswer() {
            if (!popupRoot) return;
            var c = S.claim;
            // display, not the hidden attribute: the stylesheet's display:flex
            // on .pay-switch would win over the attribute's UA rule.
            if (P.form) P.form.style.display = c ? 'none' : '';
            if (P.tabs) P.tabs.style.display = c ? 'none' : '';
            if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
            if (!c) { P.answer.innerHTML = ''; return; }
            var payingBank = S.payUi.method === 'bank';
            var trx = isTrx(S.payUi.method);
            var amountLabel = money(amount);
            var remainingMs = Math.max(0, CLAIM_WINDOW_MS - (Date.now() - c.startedAt));
            var remaining = Math.floor(remainingMs / 60000) + ':' + String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');
            var showContinue = !c.polling || Date.now() - c.startedAt >= CLAIM_CONTINUE_AFTER_MS;
            var changeLink = payingBank ? '' : '<button type="button" class="pay-check-change" data-act="change">' + glyph('pencil') + ' ' + esc(trx ? L.changeId : L.changeNumber) + '</button>';
            var payNow = '<div class="pay-check-pay"><div class="pay-check-pay-ttl"><span>' + esc(L.payNowTitle) + '</span><b>' + amountLabel + '</b></div>' + receiverBlock(false) +
                '<div class="pay-check-pay-note">' + glyph('check') + ' ' + esc(L.payNowNote) + '</div></div>';
            var continueBtn = function (primary) {
                return '<button type="button" class="' + (primary ? 'pay-submit' : 'pay-continue') + '" data-act="continue"><span>' + esc(L.continueButton) + ' ' + glyph('arrow-right', 'pay-btn-icon') + '</span></button>';
            };
            var html;
            if (c.phase === 'checking') {
                html = '<div class="pay-check"><div class="pay-check-card"><div class="pay-check-head"><div class="pay-check-spin" aria-hidden="true"></div><div class="pay-check-txt">' +
                    '<div class="pay-check-ttl">' + esc(L.checkingTitle) + '</div>' +
                    '<div class="pay-check-sub">' + (trx ? 'TrxID <strong>' + esc(S.payUi.value) + '</strong>-এর' : '<strong>' + esc(S.payUi.value) + '</strong> থেকে পাঠানো') + ' ' + amountLabel + ' ' + esc(L.checkingSuffix) + '</div>' +
                    '</div></div></div></div>';
            } else if (c.phase === 'found' && c.result && c.result.found) {
                html = '<div class="pay-check ok"><div class="pay-check-card"><div class="pay-check-head"><div class="pay-check-icon">' + glyph('check') + '</div><div class="pay-check-txt">' +
                    '<div class="pay-check-ttl">' + esc(L.foundTitle(money(c.result.amount))) + '</div><div class="pay-check-sub">' + esc(L.foundSub) + '</div></div></div></div>' +
                    '<button type="button" class="pay-submit" data-act="found-go">' + esc(L.foundButton) + ' ' + glyph('arrow-right', 'pay-btn-icon') + '</button></div>';
            } else if (c.phase === 'missing') {
                var foot = payingBank ? '' : '<div class="pay-check-foot' + (c.polling ? '' : ' ended') + '">' +
                    (c.polling
                        ? '<span class="pay-check-dot"></span><span class="pay-check-foot-txt">' + esc(L.polling) + ' <b data-part="clock">' + remaining + '</b></span>'
                        : '<span class="pay-check-foot-txt">' + esc(L.pollingEnded) + '</span><button type="button" class="pay-check-retry" data-act="retry">' + glyph('search') + ' ' + esc(L.retry) + '</button>') +
                    changeLink + '</div>';
                html = '<div class="pay-check warn"><div class="pay-check-card"><div class="pay-check-head"><div class="pay-check-icon">' + glyph('hourglass') + '</div><div class="pay-check-txt">' +
                    '<div class="pay-check-ttl">' + esc(L.missingTitle) + '</div><div class="pay-check-sub">' + esc(payingBank ? L.missingSubBank : L.missingSubWallet) + '</div></div></div>' + foot + '</div>' +
                    payNow + ((showContinue || payingBank) ? continueBtn(payingBank) : '') + waHelp(L.waMissingText, L.waMissingStrong) + '</div>';
            } else {
                var foot2 = (c.failed || changeLink) ? '<div class="pay-check-foot' + (c.failed ? ' ended' : '') + '">' +
                    (c.failed
                        ? '<span class="pay-check-foot-txt">' + esc(L.neutralFailedFoot) + '</span><button type="button" class="pay-check-retry" data-act="retry">' + glyph('search') + ' ' + esc(L.retry) + '</button>'
                        : '<span class="pay-check-foot-txt">' + esc(L.neutralOtherNumber) + '</span>') +
                    changeLink + '</div>' : '';
                html = '<div class="pay-check info"><div class="pay-check-card"><div class="pay-check-head"><div class="pay-check-icon">' + glyph('stopwatch') + '</div><div class="pay-check-txt">' +
                    '<div class="pay-check-ttl">' + esc(c.failed ? L.neutralFailedTitle : L.neutralTitle) + '</div><div class="pay-check-sub">' + esc(L.neutralSub) + '</div></div></div>' + foot2 + '</div>' +
                    payNow + continueBtn(true) + waHelp(L.waFormText, L.waFormStrong) + '</div>';
            }
            P.answer.innerHTML = html;
            bindReceiver(P.answer);
            var bind = function (act, fn) { Array.prototype.forEach.call(P.answer.querySelectorAll('[data-act="' + act + '"]'), function (b) { b.addEventListener('click', fn); }); };
            bind('change', changeClaimNumber);
            bind('retry', retryClaimCheck);
            bind('continue', continueUnverified);
            bind('found-go', function () { if (S.done) { closePopup(); opts.onSuccess && opts.onSuccess(S.done); } });
            var wa = P.answer.querySelector('.wa-help');
            if (wa) wa.addEventListener('click', function () { waTap('popup'); });
            // The clock, once a second while looking; the continue button
            // appears on its own after half a minute.
            if (c.polling) {
                tickTimer = setInterval(function () {
                    var clock = P.answer && P.answer.querySelector('[data-part="clock"]');
                    var ms = Math.max(0, CLAIM_WINDOW_MS - (Date.now() - c.startedAt));
                    if (clock) clock.textContent = Math.floor(ms / 60000) + ':' + String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
                    if (!P.answer.querySelector('[data-act="continue"]') && Date.now() - c.startedAt >= CLAIM_CONTINUE_AFTER_MS) renderAnswer();
                }, 1000);
            }
        }

        /* Main CTA: claim on record → onSuccess again; otherwise the name and
           number first, then the popup. */
        function cta() {
            if (S.done) { opts.onSuccess && opts.onSuccess(S.done); return; }
            if (!requireLead()) return;
            openPopup(S.selected);
        }

        function destroy() {
            stopClaim();
            destroyPopup(true);
            if (ctaRoot) ctaRoot.remove();
            if (bubbleRoot) bubbleRoot.remove();
            if (bubbleIo) bubbleIo.disconnect();
            clearTimeout(bubbleTimer); clearTimeout(leadTypedTimer); clearTimeout(copyTimer); clearTimeout(copyAllTimer);
            section.remove();
        }

        /* First paint: the section, and a popup restored from before the refresh. */
        renderSection();
        if (S.payUi && !S.done) renderPopup();
        updateBubble();

        return { pay: cta, open: openPopup, reset: reset, destroy: destroy, state: function () { return S; } };
    }

    window.SendMoneyCheckout = { mount: mount, METHODS: METHODS, LABELS: LABELS, bankRows: bankRows, bankCopyText: bankCopyText, validateBankRef: validateBankRef };
})();

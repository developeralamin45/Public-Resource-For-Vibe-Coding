/**
 * Every word the checkout says, in one place — the production copy, verbatim.
 *
 * Override any of them through the `labels` prop. The ones you will actually
 * change are the ones that name what the payment BUYS: production sells an
 * account ("রেজিস্ট্রেশন", "অ্যাকাউন্ট চালু"); a shop says "অর্ডার কনফার্ম",
 * a course says "কোর্সে ভর্তি". Change the noun, keep the sentence shape —
 * each line was rewritten until it read like a person, not a system.
 *
 * vanilla/send-money-checkout.js carries the same table (`LABELS`).
 */
import { formatTaka } from './bdPhone';

export const DEFAULT_LABELS = {
    // ── The section on the page ──
    heading: 'পেমেন্ট মেথড সিলেক্ট করুন',
    leadName: 'আপনার নাম',
    leadPhone: 'আপনার ফোন নাম্বার',
    leadNameError: 'আপনার নাম লিখুন',
    leadPhoneError: 'সঠিক মোবাইল নাম্বার দিন — যেমন ০১৭XXXXXXXX',
    /** The sticky button before a claim exists. */
    ctaPay: (amount: number) => `${formatTaka(amount)} টাকা পেমেন্ট করুন`,
    /** The sticky button once a claim is on record. */
    ctaDone: 'রেজিস্ট্রেশন সম্পন্ন করুন',

    // ── The done card (a claim on record, the popup closed) ──
    doneVerifiedTitle: 'পেমেন্ট পাওয়া গেছে ✓',
    doneTitle: 'পেমেন্ট তথ্য জমা হয়েছে',
    doneNote: 'টাকাটা এখনো পৌঁছায়নি — পৌঁছালেই অ্যাকাউন্ট চালু হয়ে যাবে।',
    doneRecheck: 'পাঠিয়েছি, আবার দেখুন',
    doneButton: 'রেজিস্ট্রেশন সম্পন্ন করুন',
    doneReset: 'অন্য মেথডে আবার দিতে চান?',

    // ── The popup ──
    titleWallet: (bn: string) => `${bn} সেন্ড মানি করুন`,
    titleWalletTag: '(পার্সোনাল)',
    titleBank: (bn: string) => `${bn} ট্রান্সফার করুন`,
    amountLabel: 'মোট পরিমাণ',
    receiverWallet: 'যে নম্বরে টাকা পাঠাবেন',
    receiverBank: 'যে অ্যাকাউন্টে টাকা পাঠাবেন',
    copy: 'কপি করুন',
    copied: 'কপি হয়েছে',
    copyAll: 'সব তথ্য কপি করুন',
    howTo: 'কীভাবে টাকা পাঠাবেন',
    fieldBank: 'ব্যাংকের ট্রানজেকশন আইডি / রেফারেন্স',
    fieldRocket: 'রকেটের SMS-এ পাওয়া TrxID',
    fieldWallet: (bn: string) => `যে ${bn} নম্বর থেকে টাকা পাঠালেন`,
    placeholderBank: 'যেমন: FT26AB12CD',
    placeholderRocket: 'TrxID লিখুন',
    placeholderWallet: '01XXXXXXXXX',
    submitBank: 'জমা দিন',
    submit: 'লেনদেন যাচাই করুন',
    rocketError: 'সঠিক ১০ সংখ্যার ট্রানজেকশন আইডি লিখুন।',
    /** When the host's onSubmit throws without a message. */
    submitError: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।',
    waFormText: 'টাকা পাঠাতে সমস্যা?',
    waFormStrong: 'WhatsApp-এ লিখুন',
    waMissingText: 'মিলছে না?',
    waMissingStrong: 'WhatsApp-এ স্ক্রিনশট পাঠান',
    confirmTitle: 'পেমেন্ট বন্ধ করবেন?',
    confirmMsg: 'আপনি কি নিশ্চিত পেমেন্ট প্রক্রিয়া বন্ধ করতে চান? আপনার দেওয়া তথ্য মুছে যাবে।',
    confirmYes: 'হ্যাঁ, বন্ধ করুন',
    confirmNo: 'না, চালিয়ে যাই',

    // ── The answer ──
    checkingTitle: 'পেমেন্ট চেক করা হচ্ছে…',
    checkingSuffix: 'চেক করা হচ্ছে — কয়েক সেকেন্ড লাগবে।',
    foundTitle: (amount: string) => `${amount} পেয়েছি — ধন্যবাদ!`,
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
    neutralOtherNumber: 'অন্য নম্বর থেকে পাঠিয়েছেন?',
};

export type CheckoutLabels = typeof DEFAULT_LABELS;

export const mergeLabels = (over?: Partial<CheckoutLabels>): CheckoutLabels =>
    over ? { ...DEFAULT_LABELS, ...over } : DEFAULT_LABELS;

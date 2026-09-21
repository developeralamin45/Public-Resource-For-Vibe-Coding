import { SendMoneyCheckout } from '../SendMoneyCheckout';
import type { PaymentClaim, ClaimCheck } from '../payment';
import '../../checkout.css';
// Also add, once, to index.html:  <script src="/keyboard-aware.js"></script>
// (copy it from the kit root into public/) — the Facebook-browser keyboard fix.

/**
 * Minimal usage. Everything the checkout needs from the outside is here:
 * the amount, the merchant numbers (from YOUR server, never hardcoded in a
 * real app), and the four seams to YOUR backend — server/CONTRACT.md has
 * the request and response shapes, server/node has a runnable one.
 */
const api = async <T,>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('সমস্যা হয়েছে, আবার চেষ্টা করুন।');
    return res.json() as Promise<T>;
};

export default function App() {
    return (
        <div style={{ minHeight: '100vh', background: '#f5f5f7', padding: '24px 16px 140px', maxWidth: 600, margin: '0 auto' }}>
            <SendMoneyCheckout
                amount={2950}
                amountTag="বার্ষিক"
                doneSuffix="• বার্ষিক প্ল্যান"
                config={{
                    bkash: '01700000000',
                    nagad: '01800000000',
                    rocket: '01900000000',
                    /* Drop `bank` and the bank method disappears everywhere —
                       picker, popup, the lot. branch and routingNumber may be omitted. */
                    bank: { bankName: 'Example Bank PLC', accountName: 'Your Company Ltd.', accountNumber: '1234567890123', branch: 'Gulshan', routingNumber: '123456789' },
                }}
                /* One key per distinct checkout (an order id, a plan). Turns on
                   reopen-after-refresh for an in-progress payment. */
                popupKey="annual"
                support={{ whatsapp: '8801700000000', offer: 'Smart Voice Writer-এর বার্ষিক প্ল্যান (২,৯৫০ টাকা)' }}
                /* Fired while they type, when the popup opens, at submit — the
                   call sheet for whoever never finishes. Optional. */
                onLead={(lead, stage, extra) => api('/api/lead', { ...lead, stage, ...extra })}
                /* The claim, on YOUR server. Throw new Error('বাংলায় কারণ') → shown under the field. */
                onSubmit={(claim: PaymentClaim) => api('/api/payment-claim', claim)}
                /* "Did the money arrive?" — polled every 8 s for 2 min. Omit it
                   and the popup says "being checked" and offers to continue. */
                checkClaim={(claim: PaymentClaim) => api<ClaimCheck>('/api/payment-claim/check', claim)}
                onSuccess={info => {
                    console.log('claim on record → navigate', info);
                    // navigate('/register')  — or '/thank-you', '/order/123'
                }}
                /* Meta pixel / GA seam. Never fire Purchase here — see RECIPE.md §6. */
                onTrack={(event, params) => console.log('track', event, params)}
            />
        </div>
    );
}

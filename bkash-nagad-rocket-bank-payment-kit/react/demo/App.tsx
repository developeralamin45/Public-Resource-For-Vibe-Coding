import { SendMoneyCheckout } from "../SendMoneyCheckout";
// If you only want the popup with your own picker:
// import { SendMoneyPopup } from "../SendMoneyPopup";

/**
 * Minimal usage example. In a real app, `onSubmit` calls YOUR backend to record
 * the manual-payment claim (sender number / TrxID) and `onSuccess` navigates.
 *
 * Everything below comes from YOUR server in a real checkout — merchant
 * numbers and bank details never belong in the bundle twice.
 */
export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "40px 16px" }}>
      <SendMoneyCheckout
        amount={490}
        receivers={{
          bkash: "01700000000",
          nagad: "01800000000",
          rocket: "01900000000",
        }}
        /* Drop this prop and the bank method disappears everywhere — picker,
           popup, the lot. branch and routing_number may be empty strings. */
        bank={{
          bank_name: "Example Bank PLC",
          account_name: "Your Company Ltd.",
          account_number: "1234567890123",
          branch: "Gulshan",
          routing_number: "123456789",
        }}
        /* One key per distinct checkout page (an order id, a course id).
           Turns on reopen-after-refresh for an in-progress payment. */
        popupKey="demo-order-1"
        /* Returning buyer? Prefill the sender number they used last time. */
        senderPrefill={{ bkash: "01712345678" }}
        onSubmit={async (provider, reference) => {
          // Wire to your API. Throw new Error("message") to show a toast + keep open.
          //   await api.post("/payment-claim", { provider, reference });
          // provider: "bkash" | "nagad" | "rocket" | "bank"
          console.log("submit", provider, reference);
          await new Promise((r) => setTimeout(r, 800)); // simulate network
        }}
        onSuccess={(provider, reference) => {
          console.log("success → navigate now", provider, reference);
          // navigate(`/thank-you`);
        }}
      />
    </div>
  );
}

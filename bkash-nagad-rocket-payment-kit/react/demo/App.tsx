import { SendMoneyCheckout } from "../SendMoneyCheckout";
// If you only want the popup with your own picker:
// import { SendMoneyPopup } from "../SendMoneyPopup";

/**
 * Minimal usage example. In a real app, `onSubmit` calls YOUR backend to record
 * the manual-payment claim (sender number / TrxID) and `onSuccess` navigates.
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
        onSubmit={async (provider, reference) => {
          // Wire to your API. Throw new Error("message") to show a toast + keep open.
          //   await api.post("/payment-claim", { provider, reference });
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

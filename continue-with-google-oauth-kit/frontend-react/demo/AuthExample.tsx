import { useState } from "react";
import axios from "axios";
import { GoogleButton } from "../GoogleButton";

/**
 * Example wiring. Step 1 is the button. Step 2 (collect extra fields for NEW
 * users, then POST /auth/google/register) is app-specific — shown minimally.
 *
 * Requires VITE_GOOGLE_CLIENT_ID in your .env (see RECIPE.md §3).
 */
const api = axios.create({ baseURL: "/api" });

export default function AuthExample() {
  const [pending, setPending] = useState<any>(null); // holds {name,email,picture,google_token}
  const [error, setError] = useState("");

  const finishLogin = (data: any) => {
    localStorage.setItem("token", data.token);
    // navigate to your dashboard, hydrate user state, etc.
    console.log("logged in", data);
  };

  const submitRegistration = async (extra: Record<string, any>) => {
    const res = await api.post("/auth/google/register", { google_token: pending.google_token, ...extra });
    finishLogin(res.data);
  };

  return (
    <div style={{ maxWidth: 380, margin: "60px auto", fontFamily: "system-ui" }}>
      {!pending ? (
        <GoogleButton
          http={api}
          onLogin={finishLogin}
          onNeedsRegistration={setPending}
          onError={setError}
        />
      ) : (
        // New user — collect whatever your app needs (name is pre-filled by Google).
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = e.target as any;
            submitRegistration({ name: f.name.value }).catch((err) => setError(err?.response?.data?.message || "Failed"));
          }}
          style={{ display: "grid", gap: 12 }}
        >
          <p>Welcome, {pending.email} — finish creating your account:</p>
          <input name="name" defaultValue={pending.name} placeholder="Your name" required />
          {/* add your own fields: business name, phone, etc. */}
          <button type="submit">Create account</button>
        </form>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}

import axios from "axios";
import { EmailSettingsPanel } from "../EmailSettingsPanel";

/**
 * Usage: pass your axios instance (baseURL already set to your API) and, if you
 * changed the routes, your endpoint paths. Render inside your super-admin panel.
 */
const api = axios.create({ baseURL: "/api" });

export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 24 }}>
      <EmailSettingsPanel
        http={api}
        brandName="My App"
        oauthRedirectUri="https://developers.google.com/oauthplayground"
        // endpoints={{ analytics: "/admin/email/analytics", ... }} // optional overrides
      />
    </div>
  );
}

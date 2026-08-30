import axios from "axios";
import { EmailAdminTabs } from "../EmailAdminTabs";

/**
 * Drop-in usage.
 *
 * Pass YOUR api client — the one that already carries the admin's auth token —
 * not a bare axios instance, or every call comes back 401.
 */
const api = axios.create({ baseURL: "/api" });

export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 24 }}>
      <EmailAdminTabs
        http={api}
        brandName="My App"
        // Only if you mounted the routes somewhere other than routes.example.php:
        // endpoints={{ settings: "/system-core/email-settings", templates: "/system-core/email-templates" }}
      />
    </div>
  );
}

import { useState } from "react";
import { Mail, SlidersHorizontal } from "lucide-react";
import { EmailSettingsPanel } from "./EmailSettingsPanel";
import { EmailTemplatesPanel } from "./EmailTemplatesPanel";
import type { EmailEndpoints, HttpClient } from "./types";

/**
 * Both panels behind one import — the shortest path to a finished screen.
 *
 * The split is deliberate and worth keeping if you lay it out yourself:
 * "Emails" is the tab an admin visits often (wording, switch something off),
 * "Delivery setup" is the one they touch once and then forget. Putting
 * credentials first makes the daily job the harder one to reach.
 */
export function EmailAdminTabs({
  http, endpoints, brandName = "your app", className = "",
}: {
  http: HttpClient;
  endpoints?: Partial<EmailEndpoints>;
  brandName?: string;
  className?: string;
}) {
  const [tab, setTab] = useState<"templates" | "settings">("templates");

  const Tab = ({ id, icon, children }: { id: typeof tab; icon: React.ReactNode; children: React.ReactNode }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-colors ${
        tab === id
          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
          : "text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      {icon}{children}
    </button>
  );

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-5">
        <Tab id="templates" icon={<Mail size={15} />}>Emails</Tab>
        <Tab id="settings" icon={<SlidersHorizontal size={15} />}>Delivery setup</Tab>
      </div>

      {tab === "templates"
        ? <EmailTemplatesPanel http={http} endpoints={endpoints} />
        : <EmailSettingsPanel http={http} endpoints={endpoints} brandName={brandName} />}
    </div>
  );
}

export default EmailAdminTabs;

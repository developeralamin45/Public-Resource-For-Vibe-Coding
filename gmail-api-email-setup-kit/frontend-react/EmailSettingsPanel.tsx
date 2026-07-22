import { useState, useEffect } from "react";
import {
  Mail, Send, CheckCircle2, AlertCircle, RefreshCw,
  MailCheck, ShieldAlert, Activity, Server, Save, Info,
} from "lucide-react";
import { GmailApiGuideModal } from "./GmailApiGuideModal";

/**
 * EmailSettingsPanel — a complete super-admin "Email Setup" screen:
 *   • this-month analytics cards (welcome / reset / sent / failed)
 *   • a Gmail-API settings form (sender identity + OAuth creds + OTP toggle)
 *   • a one-click "setup guide" modal (Google Cloud → Refresh Token → paste)
 *   • a test-email sender to confirm the config works
 *
 * Backend-agnostic: you pass an axios-compatible `http` client and (optionally)
 * override the endpoint paths. Pairs with the Laravel backend in this kit, but
 * any backend implementing the same 4 endpoints works — see RECIPE.md.
 *
 * Requires: react, lucide-react. Styling uses Tailwind utility classes; if you
 * don't use Tailwind, the layout still works but restyle to taste.
 */

export interface HttpClient {
  get: (url: string) => Promise<{ data: any }>;
  post: (url: string, body: any) => Promise<{ data: any }>;
}

export interface EmailEndpoints {
  analytics: string;   // GET  → { welcome_emails_sent, active_password_resets, total_emails_sent, total_emails_failed }
  getSettings: string; // GET  → SmtpSettings
  saveSettings: string; // POST SmtpSettings → { message }
  testEmail: string;   // POST { email } → { message }
}

const DEFAULT_ENDPOINTS: EmailEndpoints = {
  analytics: "/system-core/email-analytics",
  getSettings: "/system-core/email-settings",
  saveSettings: "/system-core/email-settings",
  testEmail: "/system-core/send-test-email",
};

interface EmailStats {
  welcome_emails_sent: number;
  active_password_resets: number;
  total_emails_sent: number;
  total_emails_failed: number;
}

interface SmtpSettings {
  smtp_from_address: string;
  smtp_from_name: string;
  require_email_verification: boolean;
  gmail_client_id?: string;
  gmail_client_secret?: string;
  gmail_refresh_token?: string;
}

export interface EmailSettingsPanelProps {
  /** Axios instance (or any {get, post} returning {data}). */
  http: HttpClient;
  /** Override endpoint paths if yours differ. */
  endpoints?: Partial<EmailEndpoints>;
  /** Brand name pre-filled as the default sender name. */
  brandName?: string;
  /** Redirect URI you registered in Google Cloud (shown in the guide). */
  oauthRedirectUri?: string;
}

export function EmailSettingsPanel({
  http, endpoints, brandName = "My App", oauthRedirectUri,
}: EmailSettingsPanelProps) {
  const ep = { ...DEFAULT_ENDPOINTS, ...endpoints };

  const [stats, setStats] = useState<EmailStats>({ welcome_emails_sent: 0, active_password_resets: 0, total_emails_sent: 0, total_emails_failed: 0 });
  const [settings, setSettings] = useState<SmtpSettings>({
    smtp_from_address: "", smtp_from_name: brandName, require_email_verification: false,
    gmail_client_id: "", gmail_client_secret: "", gmail_refresh_token: "",
  });

  const [loading, setLoading] = useState(true);
  const [testEmail, setTestEmail] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, settingsRes] = await Promise.all([
        http.get(ep.analytics),
        http.get(ep.getSettings),
      ]);
      setStats(statsRes.data);
      setSettings((s) => ({ ...s, ...settingsRes.data }));
    } catch (e) {
      console.error("Failed to fetch email data", e);
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestLoading(true);
    setMessage(null);
    try {
      const res = await http.post(ep.testEmail, { email: testEmail });
      setMessage({ type: "success", text: res.data.message });
      setTestEmail("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.response?.data?.message || "ইমেইল পাঠাতে সমস্যা হয়েছে। কনফিগারেশন চেক করুন।" });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    setSettingsMessage(null);
    try {
      const res = await http.post(ep.saveSettings, settings);
      setSettingsMessage({ type: "success", text: res.data.message });
    } catch (err: any) {
      setSettingsMessage({ type: "error", text: err.response?.data?.message || "সেটিংস সেভ করতে সমস্যা হয়েছে।" });
    } finally {
      setSaveLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, label, value, gradient, iconBg }: { icon: any; label: string; value: number | string; gradient: string; iconBg: string }) => (
    <div className={`relative overflow-hidden rounded-2xl p-5 border shadow-lg ${gradient}`}>
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-2">{label}</p>
          {loading ? <div className="h-8 w-16 bg-white/20 rounded-lg animate-pulse" /> : <h3 className="text-3xl font-black text-white tracking-tight">{value}</h3>}
        </div>
        <div className={`shrink-0 w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center shadow-inner`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-white">ইমেইল লগ ও সেটিংস</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">এই মাসের ইমেইল স্ট্যাটিস্টিকস ও Gmail API কনফিগারেশন</p>
          </div>
          <button onClick={fetchData} disabled={loading} className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold transition-all">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> রিফ্রেশ
          </button>
        </div>

        {/* Analytics */}
        <div>
          <h2 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">এই মাসের ইমেইল রিপোর্ট</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={MailCheck} label="ওয়েলকাম ইমেইল" value={stats.welcome_emails_sent} gradient="bg-gradient-to-br from-indigo-600 to-blue-700 border-indigo-500/20" iconBg="bg-white/20" />
            <StatCard icon={ShieldAlert} label="পাসওয়ার্ড রিসেট" value={stats.active_password_resets} gradient="bg-gradient-to-br from-amber-500 to-orange-600 border-amber-500/20" iconBg="bg-white/20" />
            <StatCard icon={Activity} label="সাকসেসফুল (মোট)" value={stats.total_emails_sent} gradient="bg-gradient-to-br from-emerald-600 to-teal-700 border-emerald-500/20" iconBg="bg-white/20" />
            <StatCard icon={AlertCircle} label="ফেইল হয়েছে" value={stats.total_emails_failed} gradient="bg-gradient-to-br from-rose-600 to-red-700 border-rose-500/20" iconBg="bg-white/20" />
          </div>
        </div>

        {/* Config + Tester */}
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Settings form */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2.5 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center gap-2.5">
                <Server size={15} className="text-violet-500" />
                <h2 className="font-black text-slate-800 dark:text-white text-sm">ইমেইল সেটিংস (Gmail API)</h2>
              </div>
              <button type="button" onClick={() => setShowGuide(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/20 transition-colors" title="কীভাবে সেটআপ করবেন — সম্পূর্ণ গাইড">
                <Info size={14} /> সেটআপ গাইড
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-5 space-y-4">
              {settingsMessage && (
                <div className={`flex items-center gap-3 p-3 rounded-xl ${settingsMessage.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {settingsMessage.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span className="text-sm font-semibold">{settingsMessage.text}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Sender Email (আপনার Gmail)</label>
                  <input type="email" value={settings.smtp_from_address} onChange={(e) => setSettings({ ...settings, smtp_from_address: e.target.value })} required placeholder="your@gmail.com" className="w-full px-3 py-2 rounded-lg border text-sm dark:bg-slate-800/50 dark:border-slate-700" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Sender Name</label>
                  <input type="text" value={settings.smtp_from_name} onChange={(e) => setSettings({ ...settings, smtp_from_name: e.target.value })} required placeholder={brandName} className="w-full px-3 py-2 rounded-lg border text-sm dark:bg-slate-800/50 dark:border-slate-700" />
                </div>
              </div>

              <div className="pt-1 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Client ID</label>
                  <input type="text" value={settings.gmail_client_id ?? ""} onChange={(e) => setSettings({ ...settings, gmail_client_id: e.target.value })} placeholder="xxxxx.apps.googleusercontent.com" className="w-full px-3 py-2 rounded-lg border text-sm dark:bg-slate-800/50 dark:border-slate-700" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Client Secret</label>
                    <input type="password" value={settings.gmail_client_secret ?? ""} onChange={(e) => setSettings({ ...settings, gmail_client_secret: e.target.value })} placeholder="GOCSPX-..." className="w-full px-3 py-2 rounded-lg border text-sm dark:bg-slate-800/50 dark:border-slate-700" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Refresh Token</label>
                    <input type="password" value={settings.gmail_refresh_token ?? ""} onChange={(e) => setSettings({ ...settings, gmail_refresh_token: e.target.value })} placeholder="1//..." className="w-full px-3 py-2 rounded-lg border text-sm dark:bg-slate-800/50 dark:border-slate-700" />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t dark:border-slate-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={settings.require_email_verification} onChange={(e) => setSettings({ ...settings, require_email_verification: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <div>
                    <span className="block text-sm font-bold text-slate-800 dark:text-white">2-Step Verification (Email OTP)</span>
                    <span className="block text-xs text-slate-500">অন থাকলে নতুন রেজিস্ট্রেশনের সময় ইমেইলে OTP যাবে।</span>
                  </div>
                </label>
              </div>

              <button type="submit" disabled={saveLoading} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors text-sm">
                {saveLoading ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />} সেটিংস সেভ করুন
              </button>
            </form>
          </div>

          {/* Test sender */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <Send size={15} className="text-emerald-500" />
              <h2 className="font-black text-slate-800 dark:text-white text-sm">টেস্ট ইমেইল সেন্ডার</h2>
            </div>
            <form onSubmit={handleTestEmail} className="p-5 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">নতুন সেটিংস কাজ করছে কি না চেক করতে একটি টেস্ট ইমেইল পাঠান।</p>
              {message && (
                <div className={`flex items-center gap-3 p-3 rounded-xl ${message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span className="text-sm font-semibold">{message.text}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">প্রাপকের ইমেইল</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} required placeholder="test@example.com" className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm dark:bg-slate-800/50 dark:border-slate-700" />
                </div>
              </div>
              <button type="submit" disabled={testLoading} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors text-sm">
                {testLoading ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />} টেস্ট ইমেইল পাঠান
              </button>
            </form>
          </div>
        </div>
      </div>

      {showGuide && <GmailApiGuideModal onClose={() => setShowGuide(false)} brandName={brandName} redirectUri={oauthRedirectUri} />}
    </>
  );
}

export default EmailSettingsPanel;

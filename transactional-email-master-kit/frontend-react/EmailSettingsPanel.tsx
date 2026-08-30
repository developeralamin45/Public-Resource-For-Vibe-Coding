import { useEffect, useState } from "react";
import {
  Mail, Send, RefreshCw, Save, Info, Server, Zap, CheckCircle2,
  AlertTriangle, Clock, Moon, ShieldCheck, Trash2,
} from "lucide-react";
import { GmailApiGuideModal } from "./GmailApiGuideModal";
import {
  DEFAULT_ENDPOINTS, type EmailAnalytics, type EmailEndpoints,
  type EmailSettings, type HttpClient, type QueuedEmail,
} from "./types";

/**
 * EmailSettingsPanel — everything about HOW mail leaves the building:
 *
 *   • a live "what would send right now" banner (Gmail API vs SMTP, ready or not)
 *   • sender identity + credentials, with a built-in A-to-Z setup guide
 *   • quiet hours, timezone and duplicate suppression
 *   • this month's delivery numbers, and the queue quiet hours is holding
 *   • a test button that reports the REAL error when it fails
 *
 * Pair it with EmailTemplatesPanel (which covers WHAT gets sent), or drop both
 * into EmailAdminTabs.
 */
export function EmailSettingsPanel({
  http,
  endpoints,
  brandName = "your app",
  className = "",
}: {
  http: HttpClient;
  endpoints?: Partial<EmailEndpoints>;
  brandName?: string;
  className?: string;
}) {
  const ep = { ...DEFAULT_ENDPOINTS, ...endpoints };

  const [s, setS] = useState<EmailSettings | null>(null);
  const [stats, setStats] = useState<EmailAnalytics | null>(null);
  const [queue, setQueue] = useState<QueuedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [guide, setGuide] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Secrets are write-only: the API never returns them, so these stay empty
  // unless the admin is actually replacing one.
  const [secrets, setSecrets] = useState({
    smtp_password: "", gmail_client_secret: "", gmail_refresh_token: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        http.get(ep.settings),
        http.get(ep.analytics),
        http.get(ep.outbox).catch(() => ({ data: [] })),
      ]);
      setS(a.data);
      setStats(b.data);
      setQueue(c.data ?? []);
    } catch {
      setMsg({ ok: false, text: "Could not load email settings." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!s) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await http.post(ep.settings, { ...s, ...pruneEmpty(secrets) });
      setS(prev => prev && { ...prev, status: res.data.status ?? prev.status });
      setSecrets({ smtp_password: "", gmail_client_secret: "", gmail_refresh_token: "" });
      setMsg({ ok: true, text: res.data.message ?? "Saved." });
      load();
    } catch (err: any) {
      setMsg({ ok: false, text: err?.response?.data?.message ?? "Could not save settings." });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    setMsg(null);
    try {
      const res = await http.post(ep.test, { email: testTo });
      setMsg({ ok: true, text: res.data.message });
      setTestTo("");
    } catch (err: any) {
      // Show the server's message verbatim — "invalid credentials" and
      // "connection timed out" need completely different fixes.
      setMsg({ ok: false, text: err?.response?.data?.message ?? "Sending failed." });
    } finally {
      setTesting(false);
    }
  };

  const cancelQueued = async (id: number) => {
    await http.delete(`${ep.outbox}/${id}`);
    setQueue(q => q.filter(x => x.id !== id));
  };

  if (loading || !s) {
    return (
      <div className="py-20 flex justify-center">
        <div className="w-8 h-8 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const set = <K extends keyof EmailSettings>(k: K, v: EmailSettings[K]) =>
    setS(prev => prev && { ...prev, [k]: v });

  return (
    <div className={`space-y-5 ${className}`}>

      {/* ── What would send right now ─────────────────────────────────── */}
      <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
        s.status.ready
          ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25"
          : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25"}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white ${
          s.status.ready ? "bg-emerald-500" : "bg-amber-500"}`}>
          {s.status.mode === "gmail_api" ? <Zap size={18} /> : <Server size={18} />}
        </div>
        <div className="min-w-0">
          <p className="font-black text-sm text-slate-800 dark:text-white">
            {s.status.mode === "gmail_api"
              ? "Sending through the Gmail API (port 443)"
              : `Sending through SMTP${s.status.host ? ` — ${s.status.host}` : ""}`}
          </p>
          <p className="text-[12.5px] text-slate-600 dark:text-slate-300 mt-0.5">
            {s.status.ready
              ? <>From <b>{s.status.from}</b>. {s.status.mode === "smtp" &&
                  "If mail times out in production, your host is probably blocking SMTP ports — set up the Gmail API below."}</>
              : "Credentials are incomplete, so nothing can be sent yet. Fill in the form below."}
          </p>
        </div>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 p-3 rounded-xl text-sm font-semibold ${
          msg.ok
            ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>
          {msg.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span className="break-words">{msg.text}</span>
        </div>
      )}

      {/* ── This month ─────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Sent" value={stats.sent} tone="from-emerald-500 to-emerald-600" />
          <Stat label="Failed" value={stats.failed} tone="from-rose-500 to-rose-600" />
          <Stat label="Skipped (off / duplicate)" value={stats.skipped} tone="from-slate-500 to-slate-600" />
          <Stat label="Success rate" value={`${stats.success_rate}%`} tone="from-indigo-500 to-indigo-600" />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">

        {/* ── Settings form ────────────────────────────────────────────── */}
        <form onSubmit={save} className="lg:col-span-2 space-y-5">

          <Card title="Who the email comes from"
                subtitle="Shown in the recipient's inbox — use an address you own.">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Sender email">
                <input type="email" required value={s.smtp_from_address}
                  onChange={e => set("smtp_from_address", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Sender name">
                <input required value={s.smtp_from_name}
                  onChange={e => set("smtp_from_name", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </Card>

          <Card
            title="Gmail API — recommended"
            subtitle="Sends over HTTPS (port 443), so it works on hosts that block SMTP."
            action={
              <button type="button" onClick={() => setGuide(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[12px] font-black hover:bg-indigo-100 transition-colors">
                <Info size={13} /> Setup guide
              </button>
            }>
            <div className="space-y-3">
              <Field label="Client ID" hint="ends with .apps.googleusercontent.com">
                <input value={s.gmail_client_id}
                  onChange={e => set("gmail_client_id", e.target.value)}
                  className={inputCls} spellCheck={false} />
              </Field>
              <Field label="Client secret" hint="starts with GOCSPX-">
                <SecretInput
                  stored={s.gmail_client_secret_set}
                  value={secrets.gmail_client_secret}
                  onChange={v => setSecrets(p => ({ ...p, gmail_client_secret: v }))} />
              </Field>
              <Field label="Refresh token" hint="starts with 1// — not the 4/0… authorization code">
                <SecretInput
                  stored={s.gmail_refresh_token_set}
                  value={secrets.gmail_refresh_token}
                  onChange={v => setSecrets(p => ({ ...p, gmail_refresh_token: v }))} />
              </Field>
            </div>
          </Card>

          <Card title="SMTP — fallback"
                subtitle="Used only when no Gmail API credentials are saved.">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Host"><input value={s.smtp_host}
                onChange={e => set("smtp_host", e.target.value)} placeholder="smtp.gmail.com" className={inputCls} /></Field>
              <Field label="Port" hint="587 (STARTTLS) or 465 (SSL)"><input value={s.smtp_port}
                onChange={e => set("smtp_port", e.target.value)} placeholder="587" className={inputCls} /></Field>
              <Field label="Username" hint="usually the same as the sender email"><input value={s.smtp_username}
                onChange={e => set("smtp_username", e.target.value)} className={inputCls} /></Field>
              <Field label="Password" hint="for Gmail, an App Password — not your login password">
                <SecretInput stored={s.smtp_password_set} value={secrets.smtp_password}
                  onChange={v => setSecrets(p => ({ ...p, smtp_password: v }))} />
              </Field>
            </div>
          </Card>

          <Card title="When emails may go out"
                subtitle="Anything held back is queued and sent when the window opens — never dropped.">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input type="checkbox" checked={s.email_quiet_enabled}
                onChange={e => set("email_quiet_enabled", e.target.checked)}
                className="w-4 h-4 accent-indigo-600" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Moon size={14} /> Hold non-urgent emails during quiet hours
              </span>
            </label>

            {s.email_quiet_enabled && (
              <div className="grid sm:grid-cols-3 gap-3 mb-3">
                <Field label="Quiet from"><input type="time" value={s.email_quiet_start}
                  onChange={e => set("email_quiet_start", e.target.value)} className={inputCls} /></Field>
                <Field label="Quiet until"><input type="time" value={s.email_quiet_end}
                  onChange={e => set("email_quiet_end", e.target.value)} className={inputCls} /></Field>
                <Field label="Timezone"><input value={s.email_timezone}
                  onChange={e => set("email_timezone", e.target.value)}
                  placeholder="Asia/Dhaka" className={inputCls} /></Field>
              </div>
            )}

            <Field label="Ignore repeats within (minutes)"
                   hint="Stops a double-clicked button sending the same email twice. 0 = off.">
              <input type="number" min={0} max={1440} value={s.email_dedupe_minutes}
                onChange={e => set("email_dedupe_minutes", Number(e.target.value))}
                className={`${inputCls} max-w-[140px]`} />
            </Field>

            <p className="mt-3 flex items-start gap-2 text-[12px] text-slate-500 dark:text-slate-400">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              Login codes and password resets always ignore these rules — people are
              waiting on those, so {brandName} sends them immediately.
            </p>
          </Card>

          <button type="submit" disabled={saving}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            Save settings
          </button>
        </form>

        {/* ── Side column ──────────────────────────────────────────────── */}
        <div className="space-y-5">

          <Card title="Send a test" subtitle="The fastest way to prove the credentials work.">
            <form onSubmit={sendTest} className="space-y-3">
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="email" required value={testTo} onChange={e => setTestTo(e.target.value)}
                  placeholder="you@example.com" className={`${inputCls} pl-9`} />
              </div>
              <button type="submit" disabled={testing}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-colors">
                {testing ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                Send test email
              </button>
            </form>
          </Card>

          {queue.length > 0 && (
            <Card title={`Waiting to send (${queue.length})`}
                  subtitle="Held by quiet hours. They go out automatically.">
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {queue.map(q => (
                  <li key={q.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <Clock size={13} className="mt-0.5 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-bold text-slate-700 dark:text-slate-200 truncate">{q.subject}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {q.to_email} · {new Date(q.send_after).toLocaleString()}
                      </p>
                      {q.last_error && <p className="text-[11px] text-rose-500 mt-0.5 truncate">{q.last_error}</p>}
                    </div>
                    <button onClick={() => cancelQueued(q.id)}
                      className="p-1 text-slate-400 hover:text-rose-500 transition-colors" title="Cancel">
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {stats && stats.top_events.length > 0 && (
            <Card title="Most sent this month" subtitle={stats.period}>
              <ul className="space-y-1.5">
                {stats.top_events.map(t => (
                  <li key={t.type} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="font-mono text-slate-600 dark:text-slate-300 truncate">{t.type}</span>
                    <span className="font-black text-slate-800 dark:text-white shrink-0">{t.c}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {guide && <GmailApiGuideModal onClose={() => setGuide(false)} brandName={brandName} />}
    </div>
  );
}

/* ── Bits ──────────────────────────────────────────────────────────────── */

const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800/60 text-sm";

/** Empty strings are dropped so a blank secret box never erases a stored one. */
function pruneEmpty(o: Record<string, string>) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v.trim() !== ""));
}

function SecretInput({ stored, value, onChange }: {
  stored: boolean; value: string; onChange: (v: string) => void;
}) {
  return (
    <input
      type="password"
      value={value}
      onChange={e => onChange(e.target.value)}
      autoComplete="new-password"
      spellCheck={false}
      placeholder={stored ? "•••••••• saved — type to replace" : "not set"}
      className={inputCls}
    />
  );
}

function Card({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div>
          <h3 className="font-black text-sm text-slate-800 dark:text-white">{title}</h3>
          {subtitle && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className={`rounded-2xl p-4 bg-gradient-to-br ${tone} text-white shadow-lg`}>
      <p className="text-[10.5px] font-black uppercase tracking-wider text-white/75">{label}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
    </div>
  );
}

export default EmailSettingsPanel;

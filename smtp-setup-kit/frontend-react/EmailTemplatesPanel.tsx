import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, RefreshCw, Save, Send, Eye, RotateCcw, X,
  AlertTriangle, ShieldAlert, Users, Lock, Pencil, CheckCircle2,
} from "lucide-react";
import {
  DEFAULT_ENDPOINTS, type EmailEndpoints, type EmailEvent,
  type HttpClient, type TemplatesResponse,
} from "./types";

/**
 * EmailTemplatesPanel — the screen that makes this a system rather than a
 * mailer: every email the app can send, in one list, each one editable and
 * switchable by a non-technical admin.
 *
 *   • grouped by area (Account / Orders / Billing …) from the catalogue
 *   • one toggle per event — off means it is never sent
 *   • click an event to edit subject + body with click-to-insert {placeholders}
 *   • preview with realistic sample data, and send a real test to yourself
 *   • reset to the developer's default wording at any time
 *
 * Needs: react, lucide-react, Tailwind (restyle freely — no logic lives in the
 * class names). All copy is plain JSX text; translate it for your locale.
 */
export function EmailTemplatesPanel({
  http,
  endpoints,
  className = "",
}: {
  http: HttpClient;
  endpoints?: Partial<EmailEndpoints>;
  className?: string;
}) {
  const ep = { ...DEFAULT_ENDPOINTS, ...endpoints };

  const [data, setData] = useState<TemplatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openEvent, setOpenEvent] = useState<EmailEvent | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await http.get(ep.templates);
      setData(res.data);
    } catch {
      setToast({ ok: false, text: "Could not load the email catalogue." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Auto-dismiss so a stale success banner never sits over the next action.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const toggle = async (ev: EmailEvent, enabled: boolean) => {
    // Optimistic: a switch that waits for the network feels broken.
    setData(d => d && {
      ...d,
      events: d.events.map(e => e.event_key === ev.event_key ? { ...e, enabled } : e),
    });

    try {
      const res = await http.post(`${ep.template}/${ev.event_key}/toggle`, { enabled });
      if (res.data?.warning) setToast({ ok: false, text: res.data.warning });
    } catch {
      setData(d => d && {
        ...d,
        events: d.events.map(e => e.event_key === ev.event_key ? { ...e, enabled: !enabled } : e),
      });
      setToast({ ok: false, text: "Could not change that setting." });
    }
  };

  const grouped = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();

    const matches = data.events.filter(e =>
      !q ||
      e.label.toLowerCase().includes(q) ||
      e.event_key.toLowerCase().includes(q) ||
      e.subject.toLowerCase().includes(q));

    return data.groups
      .map(g => ({ group: g, events: matches.filter(e => e.group === g) }))
      .filter(g => g.events.length > 0);
  }, [data, search]);

  const notSeeded = data?.events.some(e => !e.saved);

  return (
    <div className={`space-y-4 ${className}`}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-slate-800 dark:text-white">Emails this app sends</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Edit the wording, or switch any of them off.
            {data?.preset && <> Catalogue: <b>{data.preset}</b></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search emails…"
              className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800/60 text-sm w-52"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {toast && (
        <div className={`flex items-start gap-2 p-3 rounded-xl text-sm font-semibold ${
          toast.ok
            ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>
          {toast.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                    : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}

      {notSeeded && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-800 dark:text-sky-300 text-[13px]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Some emails have no saved copy yet — they will send with the developer defaults.
            Run <code className="font-mono">php artisan db:seed --class=EmailTemplateSeeder</code> to make them editable here.
          </span>
        </div>
      )}

      {/* ── The catalogue ──────────────────────────────────────────────── */}
      {loading && !data ? (
        <div className="py-16 flex justify-center">
          <div className="w-8 h-8 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : grouped.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">No emails match “{search}”.</p>
      ) : (
        grouped.map(({ group, events }) => (
          <section key={group} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <h3 className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60">
              {group}
            </h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {events.map(ev => (
                <li key={ev.event_key} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <button onClick={() => setOpenEvent(ev)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800 dark:text-white">{ev.label}</span>
                      {ev.critical && <Badge tone="rose" icon={<Lock size={10} />}>Critical</Badge>}
                      {ev.audience === "admin" && <Badge tone="slate" icon={<Users size={10} />}>Internal</Badge>}
                      {ev.edited && <Badge tone="indigo" icon={<Pencil size={10} />}>Edited</Badge>}
                    </div>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{ev.subject}</p>
                  </button>
                  <Switch checked={ev.enabled} onChange={v => toggle(ev, v)} label={ev.label} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {data?.orphans?.length ? (
        <p className="text-[12px] text-slate-500">
          <ShieldAlert size={12} className="inline -mt-0.5 mr-1" />
          Saved templates with no matching event in config (safe to delete):{" "}
          <span className="font-mono">{data.orphans.join(", ")}</span>
        </p>
      ) : null}

      {openEvent && (
        <TemplateEditor
          http={http}
          ep={ep}
          event={openEvent}
          onClose={() => setOpenEvent(null)}
          onSaved={(updated) => {
            setData(d => d && {
              ...d,
              events: d.events.map(e => e.event_key === updated.event_key ? updated : e),
            });
            setToast({ ok: true, text: `“${updated.label}” saved.` });
            setOpenEvent(null);
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   The editor
───────────────────────────────────────────────────────────────────────── */

function TemplateEditor({
  http, ep, event, onClose, onSaved,
}: {
  http: HttpClient;
  ep: EmailEndpoints;
  event: EmailEvent;
  onClose: () => void;
  onSaved: (e: EmailEvent) => void;
}) {
  const [subject, setSubject] = useState(event.subject);
  const [body, setBody] = useState(event.body);
  const [busy, setBusy] = useState<"" | "save" | "preview" | "test">("");
  const [preview, setPreview] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Which field a placeholder chip should drop into — whichever was last used.
  const lastFocused = useRef<"subject" | "body">("body");

  const dirty = subject !== event.subject || body !== event.body;

  /** Insert {placeholder} at the caret of whichever field was last focused. */
  const insert = (name: string) => {
    const token = `{${name}}`;
    const el = lastFocused.current === "subject" ? subjectRef.current : bodyRef.current;
    if (!el) return;

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);

    lastFocused.current === "subject" ? setSubject(next) : setBody(next);

    // Restore the caret after React re-renders, so the admin can keep typing
    // instead of hunting for their place again.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    setBusy("save"); setError(null);
    try {
      await http.put(`${ep.template}/${event.event_key}`, { subject, body, enabled: event.enabled });
      onSaved({ ...event, subject, body, saved: true, edited: true });
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Could not save the template.");
    } finally {
      setBusy("");
    }
  };

  const doPreview = async () => {
    setBusy("preview"); setError(null);
    try {
      const res = await http.post(`${ep.template}/${event.event_key}/preview`, { subject, body });
      setPreview(res.data.html);
    } catch {
      setError("Could not build the preview.");
    } finally {
      setBusy("");
    }
  };

  const sendTest = async () => {
    if (!testTo) return;
    setBusy("test"); setError(null);
    try {
      const res = await http.post(`${ep.template}/${event.event_key}/test`, { email: testTo, subject, body });
      setError(null);
      alert(res.data?.message ?? "Test sent.");
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Could not send the test email.");
    } finally {
      setBusy("");
    }
  };

  const reset = async () => {
    setBusy("save"); setError(null);
    try {
      const res = await http.post(`${ep.template}/${event.event_key}/reset`);
      setSubject(res.data.template.subject);
      setBody(res.data.template.body);
    } catch {
      setError("Could not reset the template.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="min-w-0">
            <h2 className="font-black text-slate-800 dark:text-white truncate">{event.label}</h2>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">{event.event_key}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-4">

          {event.critical && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[12.5px]">
              <Lock size={14} className="mt-0.5 shrink-0" />
              <span>
                People are actively waiting for this email, so it ignores quiet hours and always
                sends immediately. Keep the key details ({"{otp}"}, links) in your wording.
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[13px]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {/* Placeholder chips */}
          {Object.keys(event.variables).length > 0 && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                Click to insert
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(event.variables).map(([name, desc]) => (
                  <button
                    key={name}
                    type="button"
                    title={desc}
                    onClick={() => insert(name)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-mono text-[11.5px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-colors"
                  >
                    {`{${name}}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Subject</label>
            <input
              ref={subjectRef}
              value={subject}
              onFocus={() => (lastFocused.current = "subject")}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800/60 text-sm"
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
              Body — HTML allowed
            </label>
            <textarea
              ref={bodyRef}
              value={body}
              onFocus={() => (lastFocused.current = "body")}
              onChange={e => setBody(e.target.value)}
              rows={12}
              spellCheck={false}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800/60 text-[13px] font-mono leading-relaxed"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Header, footer and branding are added automatically. Use
              <code className="mx-1 font-mono">class="btn"</code> on a link for a button, and
              <code className="mx-1 font-mono">class="code"</code> for a large code.
            </p>
          </div>

          {preview && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Preview</span>
                <button onClick={() => setPreview(null)} className="text-[11px] font-bold text-slate-400 hover:text-slate-600">
                  Hide
                </button>
              </div>
              {/* Sandboxed iframe: the preview is arbitrary HTML the admin typed,
                  and it must not be able to reach into the admin panel around it. */}
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={preview}
                className="w-full h-96 rounded-xl border border-slate-200 dark:border-slate-700 bg-white"
              />
            </div>
          )}

          <div className="flex items-end gap-2 pt-1">
            <div className="flex-1">
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                Send a test to
              </label>
              <input
                type="email"
                value={testTo}
                onChange={e => setTestTo(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800/60 text-sm"
              />
            </div>
            <button
              onClick={sendTest}
              disabled={!testTo || busy === "test"}
              className="px-4 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {busy === "test" ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
              Send
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            onClick={reset}
            className="px-3 py-2.5 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white font-bold text-[13px] flex items-center gap-1.5 transition-colors"
            title="Restore the developer's default wording"
          >
            <RotateCcw size={14} /> Reset
          </button>
          <button
            onClick={doPreview}
            disabled={busy === "preview"}
            className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-[13px] flex items-center gap-1.5 transition-colors"
          >
            {busy === "preview" ? <RefreshCw size={14} className="animate-spin" /> : <Eye size={14} />}
            Preview
          </button>
          <div className="flex-1" />
          <button
            onClick={save}
            disabled={!dirty || busy === "save"}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[13px] flex items-center gap-1.5 disabled:opacity-50 transition-colors"
          >
            {busy === "save" ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Bits ──────────────────────────────────────────────────────────────── */

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={`${label} — ${checked ? "on" : "off"}`}
      onClick={() => onChange(!checked)}
      className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
        checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}
    >
      <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
        checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

function Badge({ children, tone, icon }: { children: React.ReactNode; tone: string; icon?: React.ReactNode }) {
  const tones: Record<string, string> = {
    rose:   "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    slate:  "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black ${tones[tone]}`}>
      {icon}{children}
    </span>
  );
}

export default EmailTemplatesPanel;

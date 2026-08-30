import { type ReactNode } from "react";
import { Info, X, ExternalLink, AlertTriangle, Settings, Check } from "lucide-react";

/**
 * The A-to-Z credentials walkthrough, shown from EmailSettingsPanel.
 *
 * This guide is the reason a non-technical admin can finish the setup alone,
 * so keep the steps verbatim when you adapt the kit — every one of them exists
 * because it is somewhere people get stuck:
 *
 *   • "Publish app" — skip it and the refresh token silently dies after 7 days,
 *     which reads as "email randomly stopped working next week".
 *   • The redirect URI must be added BEFORE opening the Playground, or the
 *     authorize step fails with redirect_uri_mismatch.
 *   • People copy the 4/0… authorization code instead of the 1//… refresh
 *     token; the last step spells out the difference.
 *
 * Translate the copy for your locale — it is all plain JSX text.
 */
export function GmailApiGuideModal({
  onClose,
  brandName = "your app",
  redirectUri = "https://developers.google.com/oauthplayground",
}: {
  onClose: () => void;
  brandName?: string;
  redirectUri?: string;
}) {
  const A = ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold hover:underline break-all">
      {children} <ExternalLink size={11} className="shrink-0" />
    </a>
  );

  const Mono = ({ children }: { children: ReactNode }) => (
    <span className="font-mono text-[11.5px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">{children}</span>
  );

  const Step = ({ n, title, children }: { n: string; title: string; children: ReactNode }) => (
    <div>
      <h3 className="font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-black flex items-center justify-center shrink-0">
          {n}
        </span>
        {title}
      </h3>
      <ol className="list-decimal list-inside space-y-1.5 text-[13px] leading-relaxed marker:text-slate-400">
        {children}
      </ol>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500 text-white"><Info size={16} /></div>
            <h2 className="font-black text-slate-800 dark:text-white">Gmail API setup guide</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5 text-sm text-slate-700 dark:text-slate-300">

          <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
            About 10 minutes, once. When it is done, {brandName} sends email over HTTPS —
            which keeps working on hosts that block SMTP ports.
          </p>

          <Step n="1" title="Create the OAuth app in Google Cloud">
            <li>Open <A href="https://console.cloud.google.com">console.cloud.google.com</A> and sign in
                <b> with the Gmail account you want to send from</b>.</li>
            <li>Create a new <b>Project</b> (any name, e.g. "{brandName} Mail").</li>
            <li><b>APIs &amp; Services → Library</b> → search "Gmail API" → <b>Enable</b>.</li>
            <li><b>APIs &amp; Services → OAuth consent screen</b> → User type <b>External</b> →
                fill in app name, support email, developer email → Save.</li>
            <li>Under <b>Audience → Test users</b>, add that same Gmail address.</li>
            <li className="text-rose-600 dark:text-rose-400 font-semibold">
              <AlertTriangle size={12} className="inline -mt-0.5 mr-1" />
              <b>Publishing status → “PUBLISH APP” → Confirm.</b> Skip this and Google
              expires your refresh token after 7 days — email will simply stop next week.
            </li>
            <li><b>Credentials → Create Credentials → OAuth client ID</b> → type <b>Web application</b>.</li>
            <li>Under <b>Authorized redirect URIs</b>, add exactly:
              <div className="mt-1"><Mono>{redirectUri}</Mono></div>
            </li>
            <li>Create, then copy the <b>Client ID</b> and <b>Client secret</b>.</li>
          </Step>

          <Step n="2" title="Get a refresh token">
            <li>Open <A href="https://developers.google.com/oauthplayground">developers.google.com/oauthplayground</A>.</li>
            <li>Top right <Settings size={12} className="inline -mt-0.5" /> (gear) →
                tick <Check size={12} className="inline -mt-0.5" /> <b>“Use your own OAuth credentials”</b> →
                paste the Client ID and secret.</li>
            <li>On the left, in <b>“Input your own scopes”</b>, enter:
              <div className="mt-1"><Mono>https://www.googleapis.com/auth/gmail.send</Mono></div>
            </li>
            <li><b>Authorize APIs</b> → sign in with the same Gmail →
                if it warns "unverified", choose <b>Advanced → Go to … → Allow</b>.</li>
            <li>Click <b>“Exchange authorization code for tokens”</b>.</li>
            <li>Copy the long <b>Refresh token</b> — the one starting <Mono>1//</Mono>.
                <b> Not</b> the authorization code starting <Mono>4/0</Mono>.</li>
          </Step>

          <Step n="3" title="Paste them in and test">
            <li>Back in this panel: set <b>Sender email</b> (that same Gmail) and <b>Sender name</b>.</li>
            <li>Paste <b>Client ID</b>, <b>Client secret</b> and <b>Refresh token</b>.</li>
            <li><b>Save settings</b>, then send yourself a <b>test email</b>.</li>
            <li>The banner at the top should now read <i>“Sending through the Gmail API”</i>.</li>
          </Step>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[12px] leading-relaxed">
            <b>Telling the three values apart</b><br />
            • Client ID → ends with <Mono>.apps.googleusercontent.com</Mono><br />
            • Client secret → starts with <Mono>GOCSPX-</Mono><br />
            • Refresh token → starts with <Mono>1//</Mono>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-[12px] leading-relaxed text-amber-900 dark:text-amber-300">
            <b>Gmail sending limits.</b> A free Gmail account allows roughly 500 recipients
            a day, Google Workspace about 2,000. That is plenty for signup and order emails;
            if you plan to send newsletters to thousands, use a dedicated provider
            (Amazon SES, Postmark, Resend) instead.
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export default GmailApiGuideModal;

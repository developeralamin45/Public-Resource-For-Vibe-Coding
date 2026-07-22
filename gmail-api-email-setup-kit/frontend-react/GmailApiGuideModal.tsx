import { type ReactNode } from "react";
import { Info, X, ExternalLink } from "lucide-react";

/**
 * GmailApiGuideModal — the "A to Z" setup guideline shown from the email
 * settings panel. Walks the admin through: Google Cloud OAuth app → obtaining a
 * Refresh Token via OAuth Playground → pasting the three values and testing.
 *
 * This guide is WHY the kit is nice to use — a non-technical admin can follow it
 * end to end without help. Keep the steps verbatim; only `brandName` /
 * `redirectUri` are project-specific.
 */
export function GmailApiGuideModal({
  onClose, brandName = "My App", redirectUri = "https://developers.google.com/oauthplayground",
}: {
  onClose: () => void; brandName?: string; redirectUri?: string;
}) {
  const Link = ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold hover:underline break-all">
      {children} <ExternalLink size={11} className="shrink-0" />
    </a>
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500 text-white"><Info size={16} /></div>
            <h2 className="font-black text-slate-800 dark:text-white">Gmail API সেটআপ গাইড</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-5 text-sm text-slate-700 dark:text-slate-300">
          {/* Part 1 */}
          <div>
            <h3 className="font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-black flex items-center justify-center">১</span>
              Google Cloud-এ OAuth তৈরি
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-[13px] leading-relaxed marker:text-slate-400">
              <li><Link href="https://console.cloud.google.com">console.cloud.google.com</Link>-এ যান (যে Gmail দিয়ে পাঠাবেন সেটি দিয়ে লগইন)।</li>
              <li>উপরে নতুন <b>Project</b> বানান (নাম: "{brandName} Mail")।</li>
              <li><b>APIs &amp; Services → Library</b> → "Gmail API" সার্চ করে <b>Enable</b> করুন।</li>
              <li><b>APIs &amp; Services → OAuth consent screen</b> → User type <b>External</b> → App name, support email, developer email দিয়ে Save।</li>
              <li><b>Audience → Test users</b>-এ আপনার Gmail ঠিকানা যোগ করুন।</li>
              <li className="text-rose-600 dark:text-rose-400 font-semibold">⚠️ <b>Publishing status → "PUBLISH APP" → Confirm</b> (Production করুন)। না করলে Refresh Token ৭ দিন পর মেয়াদ শেষ হবে।</li>
              <li><b>Credentials → Create Credentials → OAuth client ID</b> → Type <b>Web application</b>।</li>
              <li>Authorized redirect URIs-এ যোগ করুন:
                <div className="mt-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] break-all">{redirectUri}</div>
              </li>
              <li>Create → <b>Client ID</b> ও <b>Client Secret</b> কপি করুন।</li>
            </ol>
          </div>

          {/* Part 2 */}
          <div>
            <h3 className="font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-black flex items-center justify-center">২</span>
              Refresh Token নিন (OAuth Playground)
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-[13px] leading-relaxed marker:text-slate-400">
              <li><Link href="https://developers.google.com/oauthplayground">developers.google.com/oauthplayground</Link>-এ যান।</li>
              <li>ডানে ⚙️ (গিয়ার) → ✅ <b>"Use your own OAuth credentials"</b> → Client ID ও Secret পেস্ট করুন।</li>
              <li>বাঁয়ে <b>"Input your own scopes"</b> ঘরে লিখুন:
                <div className="mt-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] break-all">https://www.googleapis.com/auth/gmail.send</div>
              </li>
              <li><b>Authorize APIs</b> → Gmail দিয়ে লগইন → "unverified" দেখালে <b>Advanced → Go to … → Allow</b>।</li>
              <li>এরপর <b>"Exchange authorization code for tokens"</b> বাটনে ক্লিক করুন।</li>
              <li>নিচে <b>Refresh token</b> ঘরে <span className="font-mono">1//</span> দিয়ে শুরু লম্বা স্ট্রিংটি কপি করুন (Authorization code <span className="font-mono">4/0…</span> নয়!)।</li>
            </ol>
          </div>

          {/* Part 3 */}
          <div>
            <h3 className="font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-black flex items-center justify-center">৩</span>
              এখানে বসান ও টেস্ট করুন
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-[13px] leading-relaxed marker:text-slate-400">
              <li>উপরের ফর্মে <b>Sender Email</b> = আপনার Gmail, <b>Sender Name</b> দিন।</li>
              <li><b>Client ID</b>, <b>Client Secret</b>, <b>Refresh Token</b> তিনটি ঘরে বসান।</li>
              <li><b>সেটিংস সেভ করুন</b> → ডান পাশে একটি ইমেইল দিয়ে <b>Test Email</b> পাঠান।</li>
            </ol>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[12px]">
            <b>প্রতিটি মান চেনার উপায়:</b><br />
            • Client ID → শেষ হয় <span className="font-mono">.apps.googleusercontent.com</span> দিয়ে<br />
            • Client Secret → শুরু <span className="font-mono">GOCSPX-</span> দিয়ে<br />
            • Refresh Token → শুরু <span className="font-mono">1//</span> দিয়ে
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors">বুঝেছি</button>
        </div>
      </div>
    </div>
  );
}

export default GmailApiGuideModal;

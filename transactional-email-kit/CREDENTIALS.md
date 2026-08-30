# Credentials — where every value goes

Written for the person setting the system up, not for the developer. You do not
need to touch code for any of this.

There are two ways your app can send email. **Pick one.** Most people should
pick the first.

| | Gmail API (recommended) | SMTP |
|---|---|---|
| Uses port | 443 (normal HTTPS) | 587 / 465 |
| Blocked by hosts? | Practically never | **Often** — DigitalOcean, many VPS and shared hosts block it |
| Setup effort | ~10 minutes, once | 2 minutes |
| Where you paste it | Admin panel → Email → Delivery setup | Same screen |

> **If your emails work on your laptop but silently fail on the live server,
> that is the SMTP port being blocked.** It is the single most common way this
> breaks, and it is why the Gmail API path exists. Switching to it fixes it.

---

## Option A — Gmail API (recommended)

You need three values from Google: a **Client ID**, a **Client secret** and a
**Refresh token**. The admin panel has this same walkthrough behind the
**Setup guide** button, with clickable links.

### 1. Create the OAuth app

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign
   in **with the Gmail account you want the emails to come from**.
2. Create a new **Project** (any name).
3. **APIs & Services → Library** → search **Gmail API** → **Enable**.
4. **APIs & Services → OAuth consent screen** → User type **External** → fill in
   app name, support email, developer email → **Save**.
5. **Audience → Test users** → add that same Gmail address.
6. ⚠️ **Publishing status → PUBLISH APP → Confirm.**
   Skip this one step and Google expires your access after **7 days** — your
   email will simply stop working next week with no warning. Do it now.
7. **Credentials → Create Credentials → OAuth client ID** → type
   **Web application**.
8. Under **Authorized redirect URIs**, add exactly:
   ```
   https://developers.google.com/oauthplayground
   ```
9. Click **Create**. Copy the **Client ID** and **Client secret**.

### 2. Get the refresh token

1. Go to [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground).
2. Top-right **⚙️ gear** → tick **“Use your own OAuth credentials”** → paste the
   Client ID and Client secret.
3. On the left, in **“Input your own scopes”**, paste:
   ```
   https://www.googleapis.com/auth/gmail.send
   ```
4. Click **Authorize APIs** → sign in with the same Gmail. If it warns the app
   is unverified: **Advanced → Go to … → Allow**.
5. Click **“Exchange authorization code for tokens”**.
6. Copy the **Refresh token** — the long value starting `1//`.

**The most common mistake:** copying the *authorization code* (starts `4/0`)
instead of the *refresh token* (starts `1//`). The authorization code is
single-use and expires in minutes; it will look like it saved and then fail.

### 3. Paste them in

Admin panel → **Email → Delivery setup**:

| Field | Value | How to recognise it |
|---|---|---|
| Sender email | the Gmail you just authorised | must be that exact account |
| Sender name | what recipients see as the sender | e.g. "Acme Support" |
| Client ID | from step 1.9 | ends `.apps.googleusercontent.com` |
| Client secret | from step 1.9 | starts `GOCSPX-` |
| Refresh token | from step 2.6 | starts `1//` |

**Save settings**, then **send yourself a test email**. The banner at the top of
the page should read *“Sending through the Gmail API”*.

---

## Option B — SMTP

Only worth it if you already know your host allows outbound SMTP.

| Field | Typical value |
|---|---|
| Host | `smtp.gmail.com` (or your provider's) |
| Port | `587` (STARTTLS) — `465` also works |
| Username | usually the same as the sender email |
| Password | for Gmail this must be an **App Password**, not your login password |

To create a Gmail App Password: enable 2-Step Verification on the account, then
**Google Account → Security → App passwords** → generate one → paste the
16-character value.

The kit tries port 587 first and falls back to 465 automatically, so a wrong
port usually self-corrects.

---

## Optional `.env` values

None of these are secret; they control the look of the emails and which
catalogue is active.

```dotenv
EMAIL_PRESET=ecommerce                        # saas | ecommerce | organization | custom
EMAIL_LOGO_URL=https://yoursite.com/logo.png  # shown in the email header
EMAIL_ACCENT=#4f46e5                          # button + heading colour
EMAIL_FOOTER_NOTE=Acme Ltd, Dhaka             # small print under the footer
```

The logo must be a **publicly reachable URL** — email clients cannot load an
image from behind your login.

You *can* also put credentials in `.env` (`GMAIL_CLIENT_ID`,
`GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`) as a fallback for a fresh install.
The admin panel values always win, and the panel is the better place: changing
them there needs no deploy.

---

## Security

- The settings screen must sit behind admin authentication. Anyone who reaches
  it can read and change your sending credentials.
- **Never commit a real client secret or refresh token to a repository**,
  public or private. If one leaks, delete the OAuth client in Google Cloud and
  create a new one — revoking is the only real fix.
- The API deliberately never sends saved secrets back to the browser. Empty
  boxes with "•••• saved" is correct behaviour, not a bug.

---

## When something goes wrong

| What you see | What it means |
|---|---|
| Test email fails with a timeout | Your host blocks SMTP. Switch to the Gmail API. |
| Worked for a week, then stopped | The OAuth app was never Published. Publish it and get a new refresh token. |
| `redirect_uri_mismatch` | The redirect URI in step 1.8 was not added before you opened the Playground. |
| `invalid_grant` | Wrong token pasted (the `4/0…` code, not `1//…`), or it was revoked. |
| Email arrives in spam | Add SPF/DKIM records for your domain, and send from a real address on it. |
| Some emails never arrive | Check **Emails** tab — that event may simply be switched off. `email_logs` will say `skipped`. |
| Emails arrive hours late | Quiet hours is holding them. Check the schedule on the Delivery setup screen. |

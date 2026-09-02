# CREDENTIALS — getting the Google Client ID

One credential, one time. Roughly ten minutes.

The same five steps live inside the admin panel, in the **Setup guide** button
beside the Client ID field, with a copy button on every value. Use that if you
have it — this file is the same walkthrough for anyone who does not.

Replace `https://example.com` below with your own site's address.

---

## 1. Create a project

<https://console.cloud.google.com/projectcreate>

Give it a name and press **CREATE**. If you already have a project, pick it from
the bar at the top instead.

## 2. Fill in Branding

<https://console.cloud.google.com/auth/branding>

App name, support email, and a logo if you want one. Then, under **App domain**:

| Field | Value |
|---|---|
| Application home page | `https://example.com` |
| Application privacy policy link | `https://example.com/privacy` |
| Application terms of service link | `https://example.com/terms` |

Press **SAVE**.

> Those two pages must actually open. Google checks them, and a 404 is a common
> reason this page refuses to save.

## 3. Create a client

<https://console.cloud.google.com/auth/clients>

**CREATE CLIENT** → Application type **Web application** → give it a name.

Under **Authorized JavaScript origins**, press **+ Add URI** and add every
address the site is opened from:

```
https://example.com
http://localhost
```

Leave **Authorized redirect URIs** underneath it **empty**. This sign-in method
does not use one.

Press **CREATE**.

> Getting these two boxes the wrong way round produces
> `Error 401: invalid_client — no registered origin`. If you see that, this is
> why.

> **Ports count.** If you open the site at `http://localhost:8000`, that is the
> origin — with the port, and no trailing slash.

## 4. Publish the app

<https://console.cloud.google.com/auth/audience>

**PUBLISH APP**, so the status reads **In production**.

This app asks Google only for a name, an email address and a picture. Those are
not sensitive permissions, so there is no review to wait for — it goes live the
moment you press the button.

> Skip this and the app stays in **Testing**, where only the addresses listed
> under *Test users* can sign in. Everyone else sees "Access blocked".

## 5. Paste the Client ID

Copy the **Client ID** from the Clients list — it ends in
`.apps.googleusercontent.com` — into **Admin → Settings → Google login**, and
save.

The Google button appears on the login page immediately. No deploy, no server
access, no cache to clear.

---

## What goes where

| | Where it lives | Secret? |
|---|---|---|
| **Client ID** | Admin panel (falls back to `GOOGLE_CLIENT_ID` in `.env`) | No — the login page uses it in the browser, by design |
| **Client Secret** | Not needed for this sign-in method. If stored, it is encrypted with `APP_KEY` and never shown again | Yes |

Neither ever belongs in the codebase or in a git repository.

## If something goes wrong

| What you see | What it means |
|---|---|
| `invalid_client — no registered origin` | The address is missing from **Authorized JavaScript origins**, or was put in the redirect box instead. Step 3. |
| "Access blocked… app is being tested" | Still in Testing. Step 4. |
| Branding will not save | A logo triggers app verification — remove it and save again. Or `/privacy` and `/terms` are not reachable. |
| Nothing happens on click | No Client ID saved yet, or a popup blocker. |
| Settings changed but nothing happened | Google warns changes can take a few minutes. Hard-refresh the login page. |

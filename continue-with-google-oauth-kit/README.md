# 🔐 Continue with Google — OAuth Kit

A complete, secure **"Continue with Google"** flow you can drop into any project:
a polished frontend button (Google Identity Services token flow — popup, no
redirect) + a Laravel backend that **verifies the token server-side** and logs
the user in, or signals that a new user should finish registration.

**React + TypeScript frontend · Laravel backend · MIT · free for anyone.**

---

## Why this exists

Social login looks simple but is easy to get subtly *insecure* (trusting the
browser, skipping the audience check, missing `email_verified`). This kit bakes
in the correct server-side verification, plus the tidy two-step UX (instant login
for known users; a short finish-registration step for new ones).

## Two ways to use it

### 🤖 Hand it to your AI agent
Point your agent at this folder (or paste [`RECIPE.md`](./RECIPE.md)):

> "Add Continue-with-Google to my project. Follow RECIPE.md — wire the button to
> my auth, keep the server-side token verification, and put my new-user setup in
> the register() hook."

### 🧑‍💻 Copy by hand
Copy `frontend-react/` into your UI and `backend-laravel/` into your API, set the
Client ID, run the migration. Full steps in [`RECIPE.md`](./RECIPE.md).

## What's in the box

```
RECIPE.md                    ← implementation guide (humans + AI): incl. Google Cloud setup
LICENSE                      ← MIT
frontend-react/
├── google.ts                   GIS loader + signInWithGoogle()
├── GoogleButton.tsx            the button (runs step 1, routes the result)
└── demo/AuthExample.tsx
backend-laravel/
├── Http/Controllers/GoogleAuthController.php   auth + register + verifyGoogleToken
├── migrations/*_add_google_id_to_users_table.php
├── config-services-google.php  merge into config/services.php
└── routes.example.php
```

## Quick start

```tsx
import axios from "axios";
import { GoogleButton } from "./frontend-react/GoogleButton";

<GoogleButton
  http={axios.create({ baseURL: "/api" })}
  onLogin={(data) => localStorage.setItem("token", data.token)}
  onNeedsRegistration={(data) => {/* collect extra fields → POST /auth/google/register */}}
/>
```

Set `VITE_GOOGLE_CLIENT_ID` (frontend) and `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
(backend). The button auto-hides when the Client ID is missing.

## Security highlights (why it's safe)

- The backend re-verifies every token with Google — **audience (`aud`) must equal
  your Client ID**, and **`email_verified` is required**.
- New Google users get a random password + a pre-verified email; existing emails
  get their `google_id` linked (no duplicate accounts).

## License

MIT — use it anywhere, including commercial projects.

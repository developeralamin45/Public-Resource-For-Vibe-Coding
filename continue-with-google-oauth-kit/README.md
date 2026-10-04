# Continue with Google (OAuth) — moved

This kit has been replaced by
[**Login & Registration + Continue with Google**](../login-registration-google-auth-kit/).

The new one is a superset. It keeps the same server-side token verification —
audience check, `email_verified` — and adds:

- the **login and registration screen** the button sits on: two sliding tabs in
  one view, floating labels, dark and light;
- a **new address is asked for a phone number and nothing else** — no account
  invented without one, and no password to make up;
- **no Google button inside Facebook's or Instagram's browser**, where Google
  refuses to work, and a phone field that survives a Bangla keyboard;
- an **admin panel field** for the Client ID with the console walkthrough beside
  it, so the owner switches Google login on without touching `.env`;
- **30 tests** that fake Google's endpoints and run offline.

Update your link:

```
https://github.com/developeralamin45/Public-Resource-For-Vibe-Coding/tree/main/login-registration-google-auth-kit
```

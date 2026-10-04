# Credentials — where every value comes from

Written for the person setting it up, not for the developer. You need a
Facebook Business account with access to **Events Manager**. Ten minutes.

You are collecting two values:

| Value | Looks like | Secret? |
|---|---|---|
| **Pixel ID** (also called Dataset ID) | `1234567890123456` — 15–16 digits | No. It is visible in your site's source. |
| **Conversions API access token** | `EAAG…` — a very long string | **Yes.** Treat it like a password. |

---

## 1. Get the Pixel ID

1. Open [business.facebook.com/events_manager](https://business.facebook.com/events_manager).
2. Pick your business (top left). In the left bar choose **Data sources**.
3. If you already have a pixel / dataset for this website, click it.
   Otherwise: **Connect data → Web → Connect**, give it a name, **Create**.
   If it offers to set up through a partner or by pasting code, close that —
   the code is already in your site.
4. Open the **Settings** tab. Copy the **Dataset ID** (older screens say
   Pixel ID). That is value one.

> One website, one pixel. If you find several, ask whoever runs your ads
> which one the campaigns use, and use that — a brand-new pixel starts with
> no history.

## 2. Create the access token

1. Same **Settings** tab, scroll to **Conversions API**.
2. Under *Set up direct integration* click **Generate access token**.
3. Copy the token **now** and keep it somewhere safe — Facebook shows it
   only once. If you lose it, generate a new one; the old one keeps working
   until you remove it.

## 3. Paste them into your site

Your developer (or AI agent) will have told you which of these applies:

- **An admin settings screen** — paste both into the Facebook / Marketing
  section and save. The token box will look empty afterwards; that is
  deliberate, it is never shown again.
- **The `.env` file on the server:**

  ```
  META_PIXEL_ID=1234567890123456
  META_CAPI_TOKEN=EAAG...
  ```

Never put the token in a chat message, a screenshot, a public repository, or
anywhere inside the website's own pages.

## 4. Test it before spending on ads

1. Events Manager → your dataset → **Test events** tab.
2. Under *Confirm your server's events are set up correctly* you will see a
   code like `TEST12345`. Put it in the **Test event code** field of your
   settings screen (or `META_TEST_EVENT_CODE=TEST12345` in `.env`).
3. In another tab open your website and go through it like a customer: view
   a product, add to cart, check out.
4. Watch the Test events tab. For each step you should see **two** rows —
   one from **Browser**, one from **Server** — and the pair marked
   **Deduplicated**. That means both channels work and are counted once.
5. Now the important one. Complete an order the way a real customer would,
   and check **Purchase** appears at the right moment for your business:
   - Cash on delivery → immediately when the order is placed.
   - Online gateway → when the payment succeeds.
   - Send money / bank / manual approval → **not** when the customer submits;
     only after you confirm or approve the payment in your admin panel.
6. **Remove the test event code** (empty the field / delete the `.env`
   line). While it is set, server events are *not counted* for your ads.

## 5. Afterwards

- **Event match quality** (Events Manager → Overview → click an event) should
  settle at 6 or more for Purchase within a few days. Below that, tell your
  developer — usually the phone or email is not being passed.
- If Purchase used to fire the moment a customer pressed a button and now
  fires only on confirmed payments, the number in Ads Manager will **go
  down**. It was counting promises; it now counts money. Judge your ads by
  the new number.
- If someone leaves your team or the token leaks: Settings → Conversions
  API → generate a new token, paste it in, and remove the old system user
  token from Business Settings.

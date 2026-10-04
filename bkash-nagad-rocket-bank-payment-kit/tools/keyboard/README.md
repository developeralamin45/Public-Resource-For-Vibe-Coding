# keyboard-aware.js — the host tests

Two harnesses, both headless Chromium through `playwright-core`:

| script | proves | against |
|---|---|---|
| `kbtest.mjs` | the kit file itself — every invariant below, 48 checks | `mock.html` (the kit popup's shape, a bottom sheet, a page form) |
| `popuptest.mjs` | **your** popup, as your project actually renders it | any saved page or URL you point it at |

```bash
# once, anywhere on the machine (the kit has no package.json of its own)
npm i --no-save playwright-core && npx playwright install chromium-headless-shell

node tools/keyboard/kbtest.mjs                         # the kit's keyboard-aware.js
KIT=../my-app/public/keyboard-aware.js node tools/keyboard/kbtest.mjs   # a project's copy

# your own popup: save the checkout page, say how to open it and where its parts are
PAGE=checkout.html OPEN="window.dpOpen('bkash', 2950)" \
CARD='#dp-card' SCROLL='#dp-scroll' FIELD='#dp-ref' SUBMIT='#dp-submit' \
node tools/keyboard/popuptest.mjs
```

`popuptest.mjs` fakes the same three hosts and checks what a buyer feels:
the field **and the button under it** above a 380 px keyboard in Facebook's
browser (host C) and with honest numbers (host B); the card fitting the band
no keyboard reaches; nothing padded, no dead space, no drift over three
seconds of heartbeat; frozen while a Bangla IME is mid-word; the card's height
back on blur; no guess over an honest host or a focus no finger caused. A page
that already includes `keyboard-aware.js` is tested as it is; `INJECT=1` adds
the kit to one that does not (the default for the bundled mock). It was written
for Founders.com.bd, whose popup is its own markup fitted to the kit's contract
(RECIPE §7a) — 16/16 there.

Both came from the Smart Voice Writer repo, where this kit is developed;
`kbtest.mjs` is that file with the kit path changed.

## Why this exists

The soft-keyboard kit cannot be tested by reading it. Its whole job is to
behave differently on three browsers that report three different things, and
the one it exists for — Facebook's in-app browser on Android — reports
*nothing at all*: no `visualViewport` event, and no changed number either.

That is also how a fix for it shipped broken. The version before this one
lengthened the payment popup's scroller with `padding-bottom` so the focused
field could be scrolled to the top of the card. It worked on the host it was
written for and was wrong everywhere else: the padding came off on **blur**,
while Android's keyboard is dismissed with a chevron that blurs nothing, so a
buyer who put the keyboard away was left looking at a white card with four
hundred pixels of nothing under the submit button. And it ran on every host,
including Chrome, which had already got this right on its own.

Nobody could have caught that by reading the diff. A test that drives the real
file through all three hosts catches it in about a second.

## What it does

`mock.html` is the payment popup's shape — a fixed overlay, a capped card, its
own scroller, a last field carrying `scroll-margin-bottom`, a submit button
under it — plus a bottom sheet and a page field, the other two surfaces the kit
has to serve. The signup page's shape (a last field with a button, terms and a
help link under it) is added to the page field by the tests that need it.

`kbtest.mjs` loads the **real** `keyboard-aware.js` (never a copy) and fakes
each host by overriding `visualViewport.height`:

| host | what it reports | who |
|---|---|---|
| A | resizes and announces it | Chrome before 108, Samsung Internet |
| B | honest numbers: vv.height drops, the layout stays | Chrome 108+, iOS Safari; in-app WebViews that skip the events |
| C | nothing: no event, no changed number | Facebook on Android |

## The invariants

The ones that must never break, whatever the implementation:

- **Nothing is ever added to a panel.** No inline `padding-bottom`, no spacer.
  A correction that mutates the page outlives the keyboard that justified it.
- **No dead space under the content**, in any state, including the keyboard
  dismissed without a blur.
- **The field and whatever it keeps under it are above the keyboard** — on the
  wallet card and on the taller bank card.
- **A host that has announced a keyboard once is believed forever after.** This
  is what keeps Chrome from being second-guessed.
- **A focus no finger caused is never guessed at** (a script, a Tab key).
- **Nothing drifts.** The heartbeat runs every 600ms for the life of the page;
  three seconds of it after a correction must change nothing at all.
- **A composition freezes everything** — a Bangla IME mid-word is the one
  moment the page must not move.
- **A page field lands at the foot of the safe band, never on a landing line,
  and the page's reserve is exactly the assumed keyboard** — never topped up
  so a scroll can reach further. Room past the keyboard is the grey band
  between the form and the keys (the signup page, Facebook's browser,
  2026-09-21). Dragged to the end, nothing of the reserve sits above the
  assumed keyboard line.
- **"Next" lands the following field on that same line by the browser's own
  scroll** (`--kb-foot` via `scroll-padding-bottom`), and the heartbeat has
  no second nudge to make.
- **The page's room and landing line are for a GUESSED keyboard only**
  (`html[data-kb-guess]`, host C). A measured keyboard gets `data-kb` for the
  overlays (`--kb-vh`, `--kb-top`, `--kb-reserve`) and nothing on the page:
  Chrome 108+ and Safari already scroll the field into the visual viewport
  the keyboard shrank and subtract `scroll-padding` from it, so the keyboard
  as padding + scroll-padding counted it twice and pinned the field under
  the browser bar on every keystroke (akhanei.com.bd checkout, 2026-10-01).

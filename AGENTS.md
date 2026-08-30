# AGENTS.md

Instructions for AI coding agents working with this repository.

## What this repo is

A library of **drop-in, production-ready features**. Each top-level folder is
one self-contained resource ("kit"). Nothing here is a dependency you install —
you copy the files into a target project and adapt them.

You will normally arrive here because someone pasted a link to one folder and
asked you to implement it in their project.

## How to use a kit

1. **Read the kit's `RECIPE.md` first, completely.** It is written as a brief
   for you. It tells you what to inspect, what to decide, what to copy, and
   what to hand back to the human. Do not start copying files before you have
   read it.
2. **Inspect the target project before you copy anything.** Every RECIPE opens
   with a discovery phase for a reason: the same kit produces a different result
   in an e-commerce store than in a SaaS. Look at the models, routes, migrations
   and existing conventions, and *fit the kit to what you find*.
3. **Adapt, do not transplant.** Match the target project's namespaces, folder
   layout, auth middleware, naming, UI framework and language. A kit that lands
   as an obviously foreign block of code is a failed implementation, even if it
   runs.
4. **Replace, do not duplicate.** If the project already does part of what the
   kit does, the kit replaces it. Two systems doing the same job is worse than
   either alone.
5. **Finish by telling the human what only they can do.** Most kits need
   credentials, an API key, a DNS record or a dashboard setting. End your work
   with that short checklist, in their language.

## Rules that apply to every kit here

- **Never commit real secrets.** Kits ship placeholders and `.example` files.
  Keys, tokens and passwords belong in `.env` or an admin panel, never in code
  or in a repository.
- **Admin endpoints go behind the project's real auth guard.** Several kits
  expose settings that read and write credentials. Find the project's existing
  admin middleware and reuse it exactly; never invent a weaker one and never
  leave these routes public.
- **Migrations get renamed to today's date** so they run after the target
  project's existing ones, keeping their relative order.
- **Skip what the project already has.** If it owns a settings table, a user
  model, an HTTP client — use the project's, and delete the kit's copy.
- **Translate the UI copy.** Component text is plain English strings. If the
  project's interface is in another language, translate as you go rather than
  leaving a mixed-language screen.
- **Report honestly.** Say what you actually ran and observed. If you could not
  run migrations or send a test, say so — do not present an unverified step as
  done.

## Conventions inside a kit

```
README.md          what it is, and a quick start
RECIPE.md          the implementation brief — read this one
CREDENTIALS.md     where each credential goes (present when a kit needs any)
LICENSE            MIT
backend-laravel/   mirrors app/ structure, plus routes.example.php
frontend-react/    components + demo/App.tsx
```

React components take an injected HTTP client (they never import axios
themselves) and accept endpoint overrides, so they work against any backend
that implements the documented contract.

## Cloning on Windows

Some kits nest files deep enough to trip Windows' 260-character path limit and
`git clone` fails with *"Filename too long"*. Fix it once with
`git config --global core.longpaths true`, or clone to a short path.

# Our Budget — love-budget

A shared money tracker for Mena and Ammar. Add income and expenses with a
category, a note, a date and **who paid**; the page keeps a monthly summary,
your balance, the per-person split, category bars and CSV/JSON export.
Everything is stored in `localStorage` on this device only — no accounts, no
servers, no tracking.

Live: https://menaammarpro.github.io/love-budget/

## What it does

- **Add an entry** — expense or income, amount, category (with suggestions),
  who paid (Ammar / Mena / both), date and an optional note.
- **Monthly summary** — income, spent and balance for the chosen month, with a
  month picker and a "roughly … a day" line.
- **Who paid what** — totals split between Ammar, Mena and shared.
- **Where it went** — CSS bars per category, biggest first, with percentages.
- **Currency** — Pakistan Rupee (₨), Romanian Leu (lei), Euro (€) or US Dollar
  ($); switch any time, all amounts follow.
- **Export / import** — download the whole thing as CSV or JSON, and load a JSON
  backup back in. **Empty the budget** starts fresh.

## Storage key

- `mena-budget` — `{ currency, entries: [{ id, kind, amount, category, who, note, date, createdAt }] }`

## Tests

No build step and no dependencies. Two quick checks:

```powershell
node --check js/app.js
node --check sw.js
node test/harness.js
```

`test/harness.js` loads `js/app.js` in a bare context and checks the pure
helpers on `window.MenaBudget` (summaries, categories, per-person split, CSV
escaping, entry cleaning and the storage round-trip).

The PNG icons are generated with the dependency-free encoder in
`tools/make-icons.js`:

```powershell
node tools/make-icons.js
```

Made with love, just for you ♥

# Vyapar Saathi — Full Application

## 1. Files changed in this rebuild

**New:**
- `static/app.js` — all frontend logic (router, 8 pages, chat, dev panel)
- `static/styles.css` — full design system (previously inline in one HTML file)

**Rewritten:**
- `static/index.html` — now an app shell with 8 real pages instead of one
  static dashboard card

**Backend, extended (not replaced):**
- `detection.py` — added `get_lapsed_customers()`, `get_daily_revenue_series()`,
  `get_category_signals()`, `get_transactions()`. Existing functions
  (`run_detection`, `get_lapsed_customer_sample`) untouched.
- `llm.py` — added `answer_question()` for real chat. Existing `get_insight()`
  untouched.
- `main.py` — added `/api/ask`, `/api/transactions`, `/api/customers/lapsed`,
  `/api/demand-signals`, `/api/trend`, `/api/campaign-log`. Existing
  `/api/insight`, `/api/launch`, `/api/transcribe`, `/api/speak` untouched.

Nothing was rebuilt from scratch. `sarvam.py` and `cognee_memory.py` are
unchanged.

## 2. What was fixed

- Sidebar items were decorative — now all 8 actually navigate and load real
  content (`navigateTo()` in `app.js`).
- Chat was a static precomputed response — now a real chat interface backed
  by `/api/ask`: the 4 suggested questions map to real detection data, live
  Groq answers arbitrary questions when configured, and unmatched questions
  without Groq get an honest "I can't answer that yet" instead of a fake
  answer.
- Added loading skeletons, error states with retry buttons, and empty states
  throughout — no more silent failures.
- Mobile: sidebar becomes a hamburger drawer below 860px, not a squeezed
  desktop layout.

## 3. What's fully working (tested from this build environment)

- All 8 pages load and render from real backend data — every new and
  existing endpoint was hit directly and returned 200 with correct data.
- Full campaign cycle tested end to end: Dashboard → Campaigns → Approve &
  Launch → `/api/launch` → campaign history updates and shows the new entry.
- Chat's 4 suggested questions tested directly against `answer_question()` —
  each returns the correct, data-driven answer; an unrelated question
  correctly returns the honest fallback instead of a fabricated one.
- Fallback mode (no API keys at all) tested — the entire app works this way.
- HTML structure and JS syntax validated; every dynamically-created element
  ID was cross-checked against where it's queried.

## 4. What I could NOT test from here (no browser in this sandbox)

- Actually clicking through the UI in a real browser — layout, responsive
  breakpoints, animations, whether anything visually overlaps.
- The mic/voice flow end to end (needs a real browser mic + a real Sarvam key).
- Live Groq/Sarvam/Cognee calls (network blocked from this sandbox, same as
  before).

**You need to do the visual QA yourself tonight — see the checklist below.**

## 5. What requires external API keys

Same as before, nothing new: `GROQ_API_KEY`, `N8N_WEBHOOK_URL`,
`SARVAM_API_KEY`, `COGNEE_API_KEY` in your `.env`. The app works fully with
zero of them set — it just runs in fallback mode for each one missing.

## 6. How to run it

```bash
pip install -r requirements.txt
python3 generate_data.py      # only needed once, or to reset the dataset
uvicorn main:app --reload --port 8123
```

Open http://127.0.0.1:8123

## 7. Your testing checklist (do this tonight, in a real browser)

Go through every one of these — don't skip any, this is the one thing I
genuinely could not verify from this sandbox:

- [ ] **Home** — 4 metric cards show real numbers, sparkline renders, Growth
      Opportunity + Recommended Action cards show text, "Review & Launch"
      jumps to Campaigns.
- [ ] **Saathi** — opens with the demo question already answered. Click all
      4 suggested chips — each gives a different, relevant answer. Type a
      random unrelated question — should get the honest "can't answer that"
      message, not a made-up one. "Clear conversation" empties the chat.
- [ ] **Business Insights** — 5 sections all show real numbers, links to
      Customers/Signals pages work.
- [ ] **Customers** — cards show real customer data, search box filters
      live, sort dropdown re-orders, "Create Campaign" jumps to Campaigns.
- [ ] **Campaigns** — review card is pre-filled, message textarea is
      editable, "Approve & Launch" shows Launching → success, campaign
      appears in history below.
- [ ] **Transactions** — table populates, search/category filter/sort all
      work, no raw CSV dump.
- [ ] **Demand Signals** — every category shows a trend bar and an
      up/down/flat badge.
- [ ] **Settings** — toggles flip on/off and persist after a page refresh.
- [ ] **Developer status** — click it in the sidebar (or in the mobile
      drawer) — shows Live/Fallback for each of the 4 integrations.
- [ ] **Resize your browser** down to phone width (or open dev tools' mobile
      view) — sidebar should disappear, hamburger menu should appear and
      open a drawer.
- [ ] **Kill the backend** (Ctrl+C on uvicorn) and reload a page — you
      should see an error state with a working "Try again" button, not a
      blank white screen.

If any box fails, that's exactly what tonight's remaining time is for — fix
it before you stop working, not tomorrow morning.

## 8. Remaining limitations

- Chat only truly reasons freely when `GROQ_API_KEY` is set — without it,
  only the 4 suggested-question intents get real answers, anything else is
  the honest fallback message (by design, not a bug).
- Customers page shows up to 20 lapsed customers; the n8n workflow itself
  only receives 5 as a sample — this is intentional and disclosed in the UI.
- No automated browser tests exist — the checklist above is manual by
  necessity given this build environment.

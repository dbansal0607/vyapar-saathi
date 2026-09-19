# Vyapar Saathi — AI Growth Partner for Paytm Merchants

Vyapar Saathi is a closed-loop AI growth agent for small Indian merchants,
built for the Paytm Build for India AI Hackathon (Merchant Growth AI track).

**Core loop:** Detect → Understand → Decide → Act → Measure → Learn.

Most merchant tools stop at showing a dashboard. Vyapar Saathi goes further:
it detects a real business signal, explains it in the merchant's own
language, recommends one concrete action, and — with the merchant's
approval — actually executes it through automation, then remembers the
outcome to improve future recommendations.

Demo merchant: Sharma Garments (a garment retailer). The product itself is
merchant-agnostic and works for any small retail business processing
payments through Paytm.

## Problem

Small merchants generate rich transaction data through every Paytm payment,
but have no time or tooling to turn that data into action. They know
something changed, "sales feel slow this week", but not why, who's affected,
or what to do about it.

## Solution

Vyapar Saathi sits on top of a merchant's transaction data and closes the
loop from signal to action:

1. **Detect** — computes real signals from transaction data: sales trend,
   average bill value, lapsed high-value customers, category-level demand.
2. **Understand** — an LLM explains those signals in warm, conversational
   Hinglish, the way a human business partner would, not a report.
3. **Decide** — recommends one specific, concrete action (e.g. a targeted
   win-back campaign), not a wall of options.
4. **Act** — on merchant approval, triggers an automated workflow (n8n) that
   executes the action.
5. **Measure & Learn** — the outcome is stored as merchant memory (Cognee),
   so future recommendations build on what's already been tried.

## Features

- **Merchant dashboard** — real-time sales, average bill, transaction
  volume, and top category, computed fresh from transaction data.
- **Saathi Chat** — a conversational interface where merchants ask business
  questions in their own words and get answers grounded in their actual
  data, not generic advice.
- **Customer intelligence** — identifies high-value customers at risk of
  churn, with the specific signals behind each (visit history, spend,
  category preference).
- **Campaign automation** — merchant reviews and approves a recommended
  campaign; approval triggers a real automated workflow that executes it.
- **Demand signals** — category-level trend detection, surfacing what's
  rising or falling in real time.
- **Tap-to-tag enrichment** — for merchants without integrated
  product/billing systems, a one-tap prompt after each payment ("kya
  becha?") captures what was sold, turning a raw payment into a
  categorized transaction without requiring new hardware or software setup.
- **Voice support** — merchants can ask questions by voice and hear
  responses spoken back, designed for the reality that a merchant's hands
  are often busy at the counter.
- **Persistent merchant memory** — the system remembers past
  recommendations and outcomes, so its advice compounds over time instead
  of repeating itself.
- **Graceful degradation** — every external integration is independently
  optional. The application runs fully end to end even if a given service
  is unavailable, with no broken UI states.

## How AI is used, and why each piece is where it is

- **LLM (Groq/Llama)** — explains and communicates. It never decides the
  underlying business numbers; those are computed deterministically from
  transaction data. This keeps the merchant-facing numbers auditable and
  trustworthy, while the LLM's role is purely to explain them naturally.
- **Cognee** — persistent memory of merchant context and past outcomes,
  enabling recommendations that improve over time rather than resetting
  with every session.
- **Sarvam** — Hindi/Hinglish speech-to-text and text-to-speech, built for
  merchants who need hands-free interaction during active business hours.
- **n8n** — the execution layer. Once a merchant approves a recommendation,
  n8n handles the actual automation (e.g. customer outreach), separating
  "deciding what to do" from "doing it."

## Architecture

- **Backend:** FastAPI (Python), with a deterministic data-analysis layer
  (pandas) separate from the LLM layer — business numbers are never
  generated or altered by a model.
- **Frontend:** A responsive web application, built to run identically on
  desktop and mobile browsers, and packaged as an installable Android app.
- **Data:** Transaction-level data processed on demand — no cached or
  hardcoded business metrics.

## Running the project

```bash
pip install -r requirements.txt
python3 generate_data.py      # generates the demo dataset
uvicorn main:app --reload --port 8123
```

Then open `http://127.0.0.1:8123`.

Add API keys to a `.env` file (see `.env.example`) to enable live LLM,
voice, memory, and workflow execution. The application is fully functional
without any of them configured.

## Future scope

- **Live Sale Assist** — real-time, point-of-sale nudges delivered the
  moment a transaction is tagged (e.g. suggesting an upsell when a bill is
  below a category's typical value), rather than insights delivered after
  the fact.
- **Direct Paytm transaction integration** — replacing the demo dataset
  with a live merchant's actual Paytm transaction feed.
- **Multi-merchant support** — extending beyond a single demo merchant to
  onboard and serve many merchants concurrently.
- **Deeper memory-driven personalization** — using accumulated outcome data
  to automatically tune which recommendations are shown, rather than
  surfacing the same categories of insight every time.
- **Expanded automation actions** — beyond campaigns, extending n8n
  workflows to inventory reordering, supplier communication, and customer
  service follow-ups.
- **Native mobile app distribution** — moving from a wrapped web app to a
  fully native mobile experience for merchants who primarily operate from
  their phones.

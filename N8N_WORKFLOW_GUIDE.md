# Building a real n8n workflow (for the "Best Use of n8n" prize)

Your backend already sends this to your n8n webhook on every "Review & Launch"
click (verified working with a mock receiver):

```json
{
  "timestamp": "...",
  "merchant_name": "Sharma Garments",
  "action_text": "Create a targeted ₹299 combo campaign.",
  "customer_count": 43,
  "customers": [
    { "customer_id": "CUST0155", "visit_count_90d": 5, "avg_spend": 325.8,
      "days_since_last_purchase": 35, "favorite_category": "Ethnic Wear" },
    ... 4 more
  ]
}
```

The `customers` array is the key addition — it gives n8n real, individual
records to loop over and act on, instead of one aggregate number. That's the
difference between "we called a webhook" and "we built a workflow."

## Step 1 — redeem the voucher and create the workflow

1. Go to the redemption guide link from the organizers, redeem
   `2026-COMMUNITY-HACKATHON-INDIA-18D35A55` in your n8n Cloud account.
2. Create a new workflow, name it "Vyapar Saathi — Campaign Automation."

## Step 2 — build these nodes

1. **Webhook** (trigger) — POST method, note the generated URL, this is what
   goes into your `.env` as `N8N_WEBHOOK_URL`.
2. **Split Out** (or "Split In Batches") on the `customers` array — this is
   what turns "one blob of data" into "one workflow run per customer," which
   is the actual automation story worth showing judges.
3. **Set/Edit Fields** node — compose a personalized message per customer
   using their fields, e.g.:
   ```
   Hi! We noticed you haven't visited Sharma Garments in
   {{ $json.days_since_last_purchase }} days. As one of our valued
   customers, here's ₹299 off your next {{ $json.favorite_category }}
   purchase this week!
   ```
4. **A real action node** — pick ONE, don't try all of them:
   - **Google Sheets** node (append row) — simplest, most reliable to set
     up fast, and still looks like "the campaign contact list was
     generated automatically." Good default if you're short on time.
   - **Gmail** node — if you want an actual message sent per customer
     (use your own email as the "customer" for the demo).
   - **WhatsApp Business Cloud** node — most impressive if it works, but
     needs a Meta developer account and app review for real numbers, which
     you almost certainly don't have time to set up before Saturday. Skip
     this unless you already have API access.
5. **Merge / NoOp** node to close the loop back to one output, then have the
   Webhook respond with a summary (how many customers were processed).

## Step 3 — test it for real

1. Copy the Webhook node's URL into your project's `.env` as
   `N8N_WEBHOOK_URL=https://your-instance.app.n8n.cloud/webhook/...`
2. Run your backend, click "Review & Launch" in the app, and watch the n8n
   execution log — you should see it actually split into 5 parallel runs,
   one per customer.
3. This is the moment to actually verify it — I couldn't test this from my
   side since your n8n Cloud instance isn't reachable from where I built
   this.

## What to show judges

Don't just say "we used n8n for a webhook." Show the n8n canvas itself during
the pitch, or in the demo video, split into 5 branches, one per lapsed
customer, each with a personalized message. That visual is the actual
argument for "best use of n8n" — it's not a webhook, it's your merchant's
customers getting individually thought-through outreach, automated.

## Time budget for this

Given you're doing this before the event (not during the 4-5 hour window):
- Redeem voucher + create account: 10 min
- Build the workflow (steps 2-5 above): 45-60 min
- Test end to end with your real webhook URL: 15-20 min

Do this today or tomorrow, not Saturday morning — Saturday's 4-5 hours should
go to anything that broke, plus Sarvam voice if you get to it, not to
learning n8n's UI for the first time under pressure.

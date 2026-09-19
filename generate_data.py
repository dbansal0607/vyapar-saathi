"""
Generates transactions.csv for "Sharma Garments" — engineered so the detection
module independently derives:
  - ~8% revenue drop in the last 7 days vs the prior 7 days
  - average bill value dropping from ~Rs 240 to ~Rs 218
  - exactly 43 "lapsed high-value" customers (3+ purchases in the 60 days before
    the last 30 days, zero purchases in the last 30 days)
  - "Shirts" as the top trending category in the most recent week

Nothing here is hardcoded into the app's output — the FastAPI backend computes
all of this fresh from the CSV every time.
"""
import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

random.seed(42)
np.random.seed(42)

TODAY = datetime(2026, 9, 17)
CATEGORIES = ["Shirts", "Trousers", "Kurta", "Saree", "Ethnic Wear", "Kids Wear"]
LAPSED_TARGET = 43

rows = []
_cust_counter = 1


def new_customer_id():
    global _cust_counter
    cid = f"CUST{_cust_counter:04d}"
    _cust_counter += 1
    return cid


# 1. Baseline transactions: days -90 to -15, regular customer pool, spread categories
baseline_customers = [new_customer_id() for _ in range(120)]
for day_offset in range(90, 14, -1):
    date = TODAY - timedelta(days=day_offset)
    for _ in range(random.randint(8, 14)):
        cust = random.choice(baseline_customers)
        amount = max(80, round(np.random.normal(235, 25), 2))
        cat = random.choices(CATEGORIES, weights=[15, 20, 20, 20, 15, 10])[0]
        rows.append({"date": date, "customer_id": cust, "amount": round(amount, 2), "category": cat})

# 2. 43 lapsed high-value customers: 3-6 visits in days -90..-31, ZERO in last 30 days
lapsed_customers = [new_customer_id() for _ in range(LAPSED_TARGET)]
for cust in lapsed_customers:
    for _ in range(random.randint(3, 6)):
        day_offset = random.randint(31, 90)
        date = TODAY - timedelta(days=day_offset)
        amount = max(150, round(np.random.normal(310, 40), 2))
        rows.append({"date": date, "customer_id": cust, "amount": round(amount, 2),
                     "category": random.choice(CATEGORIES)})

# 3. Prior week (days -14..-8): exactly 79 transactions, avg bill forced to exactly 240
prev_week_customers = [random.choice(baseline_customers) for _ in range(79)]
prev_amounts = np.random.normal(240, 20, 79)
prev_amounts = prev_amounts - (prev_amounts.mean() - 240)
for i in range(79):
    date = TODAY - timedelta(days=random.randint(8, 14))
    cat = random.choices(CATEGORIES, weights=[25, 18, 18, 18, 13, 8])[0]
    rows.append({"date": date, "customer_id": prev_week_customers[i],
                 "amount": round(float(prev_amounts[i]), 2), "category": cat})

# 4. Last week (days -7..0): exactly 80 transactions, avg bill forced to exactly 218, Shirts trending
last_week_customers = [random.choice(baseline_customers) for _ in range(80)]
last_amounts = np.random.normal(218, 18, 80)
last_amounts = last_amounts - (last_amounts.mean() - 218)
for i in range(80):
    # detection.py's "last 7 days" filter is a strict date > (TODAY-7days), so
    # offsets must stay within 0-6 to land inside that window.
    date = TODAY - timedelta(days=random.randint(0, 6))
    cat = random.choices(CATEGORIES, weights=[40, 15, 15, 15, 10, 5])[0]
    rows.append({"date": date, "customer_id": last_week_customers[i],
                 "amount": round(float(last_amounts[i]), 2), "category": cat})

df = pd.DataFrame(rows)
df["date"] = pd.to_datetime(df["date"])

# 5. Correction pass: disqualify any *accidental* extra lapsed customers so the
#    count lands on exactly 43, matching the deck.
prior60_start = TODAY - timedelta(days=90)
prior60_end = TODAY - timedelta(days=31)
last30_start = TODAY - timedelta(days=30)

prior_counts = df[(df["date"] >= prior60_start) & (df["date"] <= prior60_end)].groupby("customer_id").size()
recent_customers = set(df[df["date"] > last30_start]["customer_id"].unique())
qualifying = set(prior_counts[prior_counts >= 3].index)
actual_lapsed = qualifying - recent_customers
intended_lapsed = set(lapsed_customers)

extra = actual_lapsed - intended_lapsed
fix_rows = []
for cust in extra:
    # Placed at day offset 15-29: inside "last 30 days" (so it disqualifies the
    # customer from the lapsed set) but outside the last-14-days windows used
    # for the weekly revenue comparison, so it can't skew those numbers.
    fix_rows.append({
        "date": TODAY - timedelta(days=random.randint(15, 29)),
        "customer_id": cust,
        "amount": round(max(80, np.random.normal(230, 20)), 2),
        "category": random.choice(CATEGORIES),
    })
if fix_rows:
    df = pd.concat([df, pd.DataFrame(fix_rows)], ignore_index=True)

df = df.sort_values("date").reset_index(drop=True)
df.to_csv("transactions.csv", index=False)

# Sanity print
prior_counts = df[(df["date"] >= prior60_start) & (df["date"] <= prior60_end)].groupby("customer_id").size()
recent_customers = set(df[df["date"] > last30_start]["customer_id"].unique())
qualifying = set(prior_counts[prior_counts >= 3].index)
final_lapsed = qualifying - recent_customers
print(f"Rows generated: {len(df)}")
print(f"Lapsed high-value customers: {len(final_lapsed)} (target {LAPSED_TARGET})")

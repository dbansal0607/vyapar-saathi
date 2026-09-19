"""
Pure pandas detection logic. No LLM here — this module only computes numbers.
The LLM's job (in llm.py) is purely to explain these numbers in Hinglish, never
to invent them.
"""
import pandas as pd
from datetime import datetime, timedelta

CSV_PATH = "transactions.csv"
TODAY = datetime(2026, 9, 17)


def load_df():
    df = pd.read_csv(CSV_PATH, parse_dates=["date"])
    return df


def run_detection():
    df = load_df()

    last7_start = TODAY - timedelta(days=7)
    prev7_start = TODAY - timedelta(days=14)
    prev7_end = TODAY - timedelta(days=8)

    last7 = df[df["date"] > last7_start]
    prev7 = df[(df["date"] >= prev7_start) & (df["date"] <= prev7_end)]

    revenue_last7 = last7["amount"].sum()
    revenue_prev7 = prev7["amount"].sum()
    pct_change = round((revenue_last7 - revenue_prev7) / revenue_prev7 * 100, 1)

    avg_bill_last7 = round(last7["amount"].mean(), 0)
    avg_bill_prev7 = round(prev7["amount"].mean(), 0)

    txn_count_last7 = len(last7)
    txn_count_prev7 = len(prev7)

    # Lapsed high-value customers
    prior60_start = TODAY - timedelta(days=90)
    prior60_end = TODAY - timedelta(days=31)
    last30_start = TODAY - timedelta(days=30)

    prior_counts = df[(df["date"] >= prior60_start) & (df["date"] <= prior60_end)].groupby("customer_id").size()
    recent_customers = set(df[df["date"] > last30_start]["customer_id"].unique())
    qualifying = set(prior_counts[prior_counts >= 3].index)
    lapsed_customers = qualifying - recent_customers

    # Top trending category (last 7 days vs prior 7 days, by share of transactions)
    last7_cat_share = last7["category"].value_counts(normalize=True)
    prev7_cat_share = prev7["category"].value_counts(normalize=True)
    trend = (last7_cat_share - prev7_cat_share.reindex(last7_cat_share.index).fillna(0)).sort_values(ascending=False)
    top_category = trend.index[0] if len(trend) else None

    return {
        "pct_change": pct_change,
        "avg_bill_last7": int(avg_bill_last7),
        "avg_bill_prev7": int(avg_bill_prev7),
        "txn_count_last7": txn_count_last7,
        "txn_count_prev7": txn_count_prev7,
        "lapsed_customer_count": len(lapsed_customers),
        "top_category": top_category,
    }


def get_lapsed_customer_sample(n=5):
    """
    Returns a small sample of actual lapsed high-value customers with enough
    detail for a downstream workflow (e.g. n8n) to act on individually —
    not just a count. This is what makes an n8n workflow able to loop and
    personalize per customer instead of just logging one aggregate number.
    """
    df = load_df()
    prior60_start = TODAY - timedelta(days=90)
    prior60_end = TODAY - timedelta(days=31)
    last30_start = TODAY - timedelta(days=30)

    prior = df[(df["date"] >= prior60_start) & (df["date"] <= prior60_end)]
    prior_counts = prior.groupby("customer_id").size()
    recent_customers = set(df[df["date"] > last30_start]["customer_id"].unique())
    qualifying = set(prior_counts[prior_counts >= 3].index)
    lapsed = list(qualifying - recent_customers)

    sample = []
    for cust in lapsed[:n]:
        rows = prior[prior["customer_id"] == cust]
        last_purchase = rows["date"].max()
        sample.append({
            "customer_id": cust,
            "visit_count_90d": int(rows.shape[0]),
            "avg_spend": round(float(rows["amount"].mean()), 2),
            "days_since_last_purchase": int((TODAY - last_purchase).days),
            "favorite_category": rows["category"].mode().iloc[0] if not rows["category"].mode().empty else None,
        })
    return sample


def get_lapsed_customers(n=43):
    """
    Like get_lapsed_customer_sample, but for the Customers PAGE (browsing),
    not the n8n workflow payload. Capped by `n` — pass a high number to get
    (up to) all of them. Kept as a separate function so the page can honestly
    show more customers than the n8n workflow actually receives (5, by
    design — see get_lapsed_customer_sample), without conflating the two.
    """
    return get_lapsed_customer_sample(n=n)


def get_daily_revenue_series(days=14):
    """
    Real daily revenue for the last N days, computed from transactions.csv.
    Used for the dashboard's trend sparkline — never invented, always derived.
    """
    df = load_df()
    start = TODAY - timedelta(days=days - 1)
    window = df[df["date"] >= start].copy()
    window["day"] = window["date"].dt.date
    daily = window.groupby("day")["amount"].sum().round(2)

    series = []
    for i in range(days):
        day = (start + timedelta(days=i)).date()
        series.append({"date": day.isoformat(), "revenue": float(daily.get(day, 0.0))})
    return series


def get_category_signals():
    """
    Trend direction for EVERY category (not just the top one), derived from
    real last-7-days vs prior-7-days share of transactions. This is what
    powers the Demand Signals page honestly — no fabricated stock numbers.
    """
    df = load_df()
    last7_start = TODAY - timedelta(days=7)
    prev7_start = TODAY - timedelta(days=14)
    prev7_end = TODAY - timedelta(days=8)

    last7 = df[df["date"] > last7_start]
    prev7 = df[(df["date"] >= prev7_start) & (df["date"] <= prev7_end)]

    last7_share = last7["category"].value_counts(normalize=True)
    prev7_share = prev7["category"].value_counts(normalize=True)

    all_categories = sorted(set(last7_share.index) | set(prev7_share.index))
    signals = []
    for cat in all_categories:
        last_val = float(last7_share.get(cat, 0.0))
        prev_val = float(prev7_share.get(cat, 0.0))
        delta = round(last_val - prev_val, 4)
        if delta > 0.01:
            direction = "up"
        elif delta < -0.01:
            direction = "down"
        else:
            direction = "flat"
        signals.append({
            "category": cat,
            "direction": direction,
            "last7_share_pct": round(last_val * 100, 1),
            "prev7_share_pct": round(prev_val * 100, 1),
        })
    signals.sort(key=lambda s: s["last7_share_pct"] - s["prev7_share_pct"], reverse=True)
    return signals


def get_transactions(limit=500):
    """Recent transactions for the Transactions page, most recent first."""
    df = load_df().sort_values("date", ascending=False).head(limit)
    out = []
    for _, row in df.iterrows():
        out.append({
            "date": row["date"].date().isoformat(),
            "customer_id": row["customer_id"],
            "category": row["category"],
            "amount": round(float(row["amount"]), 2),
        })
    return out


def get_top_categories(n=3):
    """Merchant's most common categories, used to populate the tap-to-tag
    buttons for merchants without an integrated billing/product system."""
    df = load_df()
    counts = df["category"].value_counts()
    return list(counts.head(n).index)


if __name__ == "__main__":
    import json
    print(json.dumps(run_detection(), indent=2))
    print(json.dumps(get_lapsed_customer_sample(), indent=2))
    print(json.dumps(get_category_signals(), indent=2))
    print(json.dumps(get_daily_revenue_series(7), indent=2))

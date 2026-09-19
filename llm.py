"""
Turns the detection module's numbers into the Hinglish, WhatsApp-style
explanation shown in the demo. This module NEVER invents the numbers — it
only explains numbers it's given.

If GROQ_API_KEY is missing or the API is unreachable (e.g. no internet, or a
locked-down network like a dev sandbox), it falls back to a scripted reply so
the app keeps working end to end.
"""
import os
import json

SYSTEM_PROMPT = """You are Vyapar Saathi, an AI growth partner for a small Indian
garment retailer. You are given real numbers computed from the merchant's
transaction data. Explain them back to the merchant in a warm, brief,
WhatsApp-style mix of Hindi and English (Hinglish), then propose exactly ONE
concrete recommended action.

Reply ONLY with JSON in this exact shape, no extra text:
{
  "reply_text": "<1-2 sentence Hinglish explanation of the sales/bill-value numbers>",
  "opportunity_headline": "<one short sentence naming the specific opportunity>",
  "recommended_action": "<one short, concrete, specific action with a number in it, e.g. a rupee amount>"
}

Never change or round the numbers you're given. Keep the tone like a trusted
business partner, not a corporate dashboard."""


def _fallback(detection):
    """Scripted reply used when the LLM API is unavailable."""
    pct = abs(detection["pct_change"])
    return {
        "reply_text": (
            f"Sales {pct:.0f}% down hain, lekin transaction count almost same hai. "
            f"Average bill value \u20b9{detection['avg_bill_prev7']} se \u20b9{detection['avg_bill_last7']} hui hai."
        ),
        "opportunity_headline": f"{detection['lapsed_customer_count']} high-value customers haven't purchased in 30 days.",
        "recommended_action": "Create a targeted \u20b9299 combo campaign.",
    }


def get_insight(detection, memory_context=None):
    api_key = os.environ.get("GROQ_API_KEY")
    context_block = ""
    if memory_context:
        joined = "\n".join(f"- {m}" for m in memory_context)
        context_block = f"\n\nRelevant memory of past interactions with this merchant:\n{joined}"

    if not api_key:
        return _fallback(detection), "fallback (no GROQ_API_KEY set)"

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1", timeout=8)
        resp = client.chat.completions.create(
            model="groq/compound",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(detection) + context_block},
            ],
            temperature=0.4,
        )
        content = resp.choices[0].message.content
        parsed = json.loads(content)
        if not all(k in parsed for k in ("reply_text", "opportunity_headline", "recommended_action")):
            raise ValueError("Malformed LLM response shape")
        return parsed, "groq"
    except Exception as e:
        return _fallback(detection), f"fallback (groq call failed: {e})"


if __name__ == "__main__":
    from detection import run_detection
    d = run_detection()
    result, source = get_insight(d)
    print(f"source: {source}")
    print(json.dumps(result, indent=2, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Real chat support (POST /api/ask). This answers actual free-text questions
# when GROQ_API_KEY is set. Without it, it never pretends to be a live LLM —
# it matches the question against known intents using the real detection
# data, and is honest when it can't match anything.
# ---------------------------------------------------------------------------

QUESTION_SYSTEM_PROMPT = """You are Vyapar Saathi, an AI growth partner for a
small Indian garment retailer. You are given real numbers computed from the
merchant's transaction data, optionally some memory of past interactions,
and a specific question the merchant just asked. Answer ONLY using the given
data — never invent numbers or claims. Reply in a warm, brief, WhatsApp-style
mix of Hindi and English (Hinglish). If the question can't be answered from
the given data, say so honestly rather than guessing.

Reply ONLY with JSON in this exact shape, no extra text:
{
  "answer": "<Hinglish answer, 1-3 sentences>",
  "opportunity_headline": "<one short sentence naming a relevant opportunity from the data, or empty string if not relevant to this question>",
  "recommended_action": "<one short concrete action, or empty string if not relevant to this question>"
}"""


def _keyword_match_question(question, detection):
    """Maps a question to one of the known intents using the REAL detection
    numbers — used only when there's no live LLM to answer freely."""
    q = question.lower()
    pct = abs(detection["pct_change"])

    if any(k in q for k in ["sale", "sales", "revenue", "kam", "down", "fall", "kyun"]):
        return {
            "answer": (
                f"Sales {pct:.0f}% down hain, lekin transaction count almost same hai. "
                f"Average bill value \u20b9{detection['avg_bill_prev7']} se \u20b9{detection['avg_bill_last7']} hui hai."
            ),
            "opportunity_headline": f"{detection['lapsed_customer_count']} high-value customers haven't purchased in 30 days.",
            "recommended_action": "Create a targeted \u20b9299 combo campaign.",
        }
    if any(k in q for k in ["customer", "slipping", "lapsed", "away"]):
        return {
            "answer": f"{detection['lapsed_customer_count']} high-value customers pichle 30 din se nahi aaye hain.",
            "opportunity_headline": f"{detection['lapsed_customer_count']} high-value customers haven't purchased in 30 days.",
            "recommended_action": "Create a targeted \u20b9299 combo campaign.",
        }
    if any(k in q for k in ["sell", "category", "trend", "weekend"]):
        return {
            "answer": f"{detection['top_category']} is trending up this week compared to last week.",
            "opportunity_headline": f"{detection['top_category']} demand is rising.",
            "recommended_action": f"Push a {detection['top_category']} promotion this weekend.",
        }
    if any(k in q for k in ["next", "should i do", "action", "recommend"]):
        return {
            "answer": "Sabse badi opportunity abhi high-value lapsed customers hain.",
            "opportunity_headline": f"{detection['lapsed_customer_count']} high-value customers haven't purchased in 30 days.",
            "recommended_action": "Create a targeted \u20b9299 combo campaign.",
        }
    return None


def answer_question(question, detection, memory_context=None):
    api_key = os.environ.get("GROQ_API_KEY")
    context_block = ""
    if memory_context:
        joined = "\n".join(f"- {m}" for m in memory_context)
        context_block = f"\n\nRelevant memory of past interactions with this merchant:\n{joined}"

    if api_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1", timeout=8)
            resp = client.chat.completions.create(
                model="groq/compound",
                messages=[
                    {"role": "system", "content": QUESTION_SYSTEM_PROMPT},
                    {"role": "user", "content": f"DATA: {json.dumps(detection)}{context_block}\n\nQUESTION: {question}"},
                ],
                temperature=0.4,
            )
            parsed = json.loads(resp.choices[0].message.content)
            if "answer" in parsed:
                parsed.setdefault("opportunity_headline", "")
                parsed.setdefault("recommended_action", "")
                return parsed, "groq"
        except Exception:
            pass  # fall through to the offline path below

    matched = _keyword_match_question(question, detection)
    if matched:
        return matched, "fallback (matched known question)"

    return {
        "answer": (
            "Abhi main sirf specific business questions ka jawab de sakta hoon — jaise "
            "sales, customers, ya trending category ke baare mein. Open-ended chat ke "
            "liye live LLM connection chahiye."
        ),
        "opportunity_headline": "",
        "recommended_action": "",
    }, "fallback (unmatched question, no LLM)"

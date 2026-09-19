import json
import os
import random
import uuid
from datetime import datetime, timedelta

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from detection import (
    run_detection,
    get_lapsed_customer_sample,
    get_lapsed_customers,
    get_daily_revenue_series,
    get_category_signals,
    get_transactions,
    get_top_categories,
    load_df,
    TODAY,
    CSV_PATH,
)
import pandas as pd
from llm import get_insight, answer_question
from sarvam import is_voice_available, transcribe_audio, synthesize_speech
import cognee_memory

app = FastAPI(title="Vyapar Saathi")

# The Android app's webview calls this backend from a different origin
# (http://<your-laptop-ip>:8123), so CORS must be open for the demo to work.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

LOG_PATH = "campaign_log.json"

# In-memory pending-payment store, for the tap-to-tag flow: merchants without
# an integrated billing/product system tag what they sold right after a
# payment lands, instead of the app pretending a raw payment amount reveals
# the product. Not persisted across restarts — fine for a live demo session.
PENDING_PAYMENTS = {}


@app.post("/api/simulate-payment")
def api_simulate_payment():
    """
    Stands in for a real Paytm payment webhook, which isn't wired up in this
    demo. In production this endpoint would be called BY Paytm's webhook the
    moment a payment lands, not by a button in this app.
    """
    payment_id = str(uuid.uuid4())[:8]
    amount = round(random.uniform(220, 650), 2)
    payment = {
        "id": payment_id,
        "amount": amount,
        "timestamp": datetime.utcnow().isoformat(),
    }
    PENDING_PAYMENTS[payment_id] = payment
    return JSONResponse({
        "payment": payment,
        "suggested_categories": get_top_categories(n=3),
    })


class TagRequest(BaseModel):
    payment_id: str
    category: str


@app.post("/api/tag-transaction")
def api_tag_transaction(req: TagRequest):
    payment = PENDING_PAYMENTS.pop(req.payment_id, None)
    if not payment:
        return JSONResponse({"success": False, "error": "Payment not found or already tagged."}, status_code=404)

    df = load_df()
    new_row = {
        "date": TODAY,
        "customer_id": "WALK-IN",
        "amount": payment["amount"],
        "category": req.category,
    }
    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    df.to_csv(CSV_PATH, index=False)

    return JSONResponse({
        "success": True,
        "message": f"Tagged \u20b9{payment['amount']} as {req.category}.",
        "row": {k: (v.isoformat() if hasattr(v, 'isoformat') else v) for k, v in new_row.items()},
    })


@app.get("/api/insight")
def api_insight():
    detection = run_detection()
    memory_context = cognee_memory.recall("recent campaigns and outcomes for Sharma Garments")
    insight, source = get_insight(detection, memory_context=memory_context)
    return JSONResponse({
        "merchant_name": "Sharma Garments",
        "merchant_question": "Meri sale iss hafte kyun kam hui?",
        "detection": detection,
        "insight": insight,
        "llm_source": source,  # visible in the API for debugging; hide in UI if you like
        "voice_available": is_voice_available(),
        "n8n_configured": bool(os.environ.get("N8N_WEBHOOK_URL")),
        "memory_available": cognee_memory.is_memory_available(),
        "memory_context_used": memory_context,
    })


@app.post("/api/transcribe")
async def api_transcribe(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    text = transcribe_audio(audio_bytes, file.filename or "audio.wav")
    if text is None:
        return JSONResponse({"available": False})
    return JSONResponse({"available": True, "text": text})


class AskRequest(BaseModel):
    question: str


@app.post("/api/ask")
def api_ask(req: AskRequest):
    detection = run_detection()
    memory_context = cognee_memory.recall(req.question)
    answer, source = answer_question(req.question, detection, memory_context=memory_context)
    return JSONResponse({
        "question": req.question,
        "detection": detection,
        "answer": answer,
        "llm_source": source,
    })


@app.get("/api/transactions")
def api_transactions(limit: int = 500):
    return JSONResponse({"transactions": get_transactions(limit=limit)})


@app.get("/api/customers/lapsed")
def api_customers_lapsed(limit: int = 20):
    return JSONResponse({
        "customers": get_lapsed_customers(n=limit),
        "note": "The n8n workflow only receives a sample of 5 of these per campaign, not the full list.",
    })


@app.get("/api/demand-signals")
def api_demand_signals():
    return JSONResponse({"signals": get_category_signals()})


@app.get("/api/trend")
def api_trend(days: int = 14):
    return JSONResponse({"series": get_daily_revenue_series(days=days)})


@app.get("/api/campaign-log")
def api_campaign_log():
    if not os.path.exists(LOG_PATH):
        return JSONResponse({"campaigns": []})
    with open(LOG_PATH) as f:
        try:
            log = json.load(f)
        except json.JSONDecodeError:
            log = []
    return JSONResponse({"campaigns": list(reversed(log))})


class SpeakRequest(BaseModel):
    text: str


@app.post("/api/speak")
def api_speak(req: SpeakRequest):
    audio = synthesize_speech(req.text)
    if audio is None:
        return JSONResponse({"available": False})
    return Response(content=audio, media_type="audio/wav")


class LaunchRequest(BaseModel):
    action_text: str
    customer_count: int
    merchant_name: str | None = "Sharma Garments"
    action: str | None = None
    campaign: str | None = "Festive Win-back Campaign"
    category: str | None = None


@app.post("/api/launch")
def api_launch(req: LaunchRequest, background_tasks: BackgroundTasks):
    webhook_url = os.environ.get("N8N_WEBHOOK_URL")
    if not webhook_url:
        return JSONResponse(
            {"status": "error", "error": "N8N_WEBHOOK_URL environment variable is not configured."},
            status_code=500,
        )

    detection = run_detection()
    customer_sample = get_lapsed_customer_sample(n=5)

    merchant_name = req.merchant_name or "Sharma Garments"
    action = req.action or req.action_text
    campaign = req.campaign or "Festive Win-back Campaign"
    category = req.category or detection.get("top_category", "Shirts")

    n8n_payload = {
        "merchant_name": merchant_name,
        "action": action,
        "campaign": campaign,
        "customer_count": req.customer_count,
        "category": category,
        "approved": True,
        # Metadata / backwards compatibility fields
        "timestamp": datetime.utcnow().isoformat(),
        "action_text": req.action_text,
        "customers": customer_sample,
    }

    import requests

    try:
        n8n_resp = requests.post(webhook_url, json=n8n_payload, timeout=10)
        n8n_resp.raise_for_status()
        try:
            n8n_data = n8n_resp.json()
        except ValueError:
            n8n_data = {"raw": n8n_resp.text}
    except Exception as e:
        return JSONResponse(
            {
                "status": "error",
                "error": f"Failed to deliver payload to n8n webhook: {str(e)}",
            },
            status_code=502,
        )

    entry = {
        "timestamp": n8n_payload["timestamp"],
        "merchant_name": merchant_name,
        "action_text": req.action_text,
        "customer_count": req.customer_count,
        "customers": customer_sample,
        "n8n_response": n8n_data,
    }

    log = []
    if os.path.exists(LOG_PATH):
        with open(LOG_PATH) as f:
            try:
                log = json.load(f)
            except json.JSONDecodeError:
                log = []
    log.append(entry)
    with open(LOG_PATH, "w") as f:
        json.dump(log, f, indent=2)

    # Optional Cognee memory — runs in the background since cognify() is slow
    memory_note = (
        f"On {entry['timestamp']}, Vyapar Saathi recommended: '{entry['action_text']}' "
        f"to {entry['customer_count']} lapsed high-value customers of Sharma Garments."
    )
    background_tasks.add_task(cognee_memory.remember, memory_note)

    return JSONResponse({"status": "launched", "entry": entry, "n8n_response": n8n_data})


app.mount("/", StaticFiles(directory="static", html=True), name="static")

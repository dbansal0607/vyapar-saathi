from fastapi import FastAPI, Request
import uvicorn, json
app = FastAPI()
received = []
@app.post("/webhook")
async def webhook(request: Request):
    payload = await request.json()
    received.append(payload)
    with open("mock_n8n_received.json", "w") as f:
        json.dump(received, f, indent=2)
    return {"status": "ok"}
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=9999)

"""
Cognee memory layer — gives Vyapar Saathi persistent memory of what's been
recommended and done for "Sharma Garments" across sessions, using your workspace-specific
Cognee Cloud API instance.

Same fallback pattern as llm.py and sarvam.py: never raises, returns a falsy
value when unavailable or the call fails, so the rest of the app keeps
working without it.
"""
import os
import requests

DATASET_NAME = "sharma-garments-memory"


def get_config():
    api_key = (os.environ.get("COGNEE_API_KEY") or "").strip()
    base_url = (os.environ.get("COGNEE_BASE_URL") or "https://api.cognee.ai").strip().rstrip("/")
    tenant_id = (os.environ.get("COGNEE_TENANT_ID") or "").strip()
    return api_key, base_url, tenant_id


def is_memory_available():
    api_key, _, _ = get_config()
    return bool(api_key)


def remember(text: str):
    """Adds + processes a memory. Returns True/False, never raises."""
    api_key, base_url, tenant_id = get_config()
    if not api_key:
        return False

    headers = {"X-Api-Key": api_key}
    if tenant_id:
        headers["X-Tenant-Id"] = tenant_id

    try:
        files = {"data": ("memory.txt", text.encode("utf-8"), "text/plain")}
        add_resp = requests.post(
            f"{base_url}/api/v1/add",
            headers=headers,
            data={"datasetName": DATASET_NAME},
            files=files,
            timeout=15,
        )
        add_resp.raise_for_status()

        json_headers = {**headers, "Content-Type": "application/json"}
        cog_resp = requests.post(
            f"{base_url}/api/v1/cognify",
            headers=json_headers,
            json={"datasets": [DATASET_NAME]},
            timeout=30,
        )
        cog_resp.raise_for_status()
        return True
    except Exception:
        return False


def recall(query_text: str, top_k: int = 3):
    """Returns a short list of relevant past memories, or [] if unavailable/failed."""
    api_key, base_url, tenant_id = get_config()
    if not api_key:
        return []

    headers = {"X-Api-Key": api_key, "Content-Type": "application/json"}
    if tenant_id:
        headers["X-Tenant-Id"] = tenant_id

    try:
        resp = requests.post(
            f"{base_url}/api/v1/search",
            headers=headers,
            json={"query": query_text, "datasets": [DATASET_NAME], "top_k": top_k},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        memories = []
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and "search_result" in item:
                    res = item["search_result"]
                    if isinstance(res, list):
                        memories.extend([str(x) for x in res])
                    elif res:
                        memories.append(str(res))
                elif isinstance(item, str):
                    memories.append(item)
        elif isinstance(data, dict):
            res = data.get("results") or data.get("search_result") or []
            if isinstance(res, list):
                memories.extend([str(x) for x in res])
            elif res:
                memories.append(str(res))

        return memories if memories else (data if isinstance(data, list) else [])
    except Exception:
        return []


if __name__ == "__main__":
    print("memory available:", is_memory_available())
    print("remember test:", remember("Test memory string"))
    print("recall test:", recall("Test query"))

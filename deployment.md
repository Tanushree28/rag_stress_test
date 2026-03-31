# Deployment Plan: RAG Stress-Test for Symposium

## Context
Live demo for symposium. Backend + Ollama run on your laptop. Frontend on Vercel (clean URL). Backend exposed publicly via **Cloudflare Tunnel** (free, no account needed) so anyone in the room can open the app on their device. Total cost: $0.

## Architecture
```
Any Device (browser)
       |
       v
Vercel (free) -- serves Next.js frontend
       |
       | API calls (fetch) go to tunnel URL
       v
Cloudflare Tunnel (free) -- public URL -> your laptop
       |
       v
Your Laptop:
  FastAPI (:8000) <-> Ollama (:11434) + llama3.1:8b
```

## What to Do

### 1. Update CORS -- `api/main.py` (lines 119-124)
Make CORS accept any origin (simplest for a demo with changing tunnel URLs):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```
(For a thesis demo, wildcard CORS is fine. Not for production.)

### 2. Deploy Frontend to Vercel (5 min, one-time)
1. Go to vercel.com, sign in with GitHub
2. Import `rag_stress_test` repo
3. Settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Next.js (auto-detected)
4. Add environment variable:
   - `NEXT_PUBLIC_API_URL` = (leave blank for now, set on demo day)
5. Deploy

### 3. Install Cloudflare Tunnel (one-time)
```bash
brew install cloudflared
```
No Cloudflare account needed -- "quick tunnels" are free and anonymous.

### 4. Demo Day -- Start Everything
```bash
# Terminal 1: Ollama (skip if already running as service)
ollama serve

# Terminal 2: Backend
cd ~/Desktop/rag_stress_test
source venv/bin/activate
uvicorn api.main:app --host 0.0.0.0 --port 8000

# Terminal 3: Tunnel
cloudflared tunnel --url http://localhost:8000
# This prints a URL like: https://random-words.trycloudflare.com
```

### 5. Demo Day -- Connect Frontend to Tunnel
1. Copy the tunnel URL from Terminal 3 (e.g., `https://random-words.trycloudflare.com`)
2. Go to Vercel dashboard > your project > Settings > Environment Variables
3. Set `NEXT_PUBLIC_API_URL` = `https://random-words.trycloudflare.com`
4. Go to Deployments > click "..." on latest > Redeploy (takes ~1 min)
5. Done -- your Vercel URL now works from any device

### 6. Warm Up Models (before presenting)
Open the Vercel URL and run one question. First request takes 30-90s as ML models load. After that, responses are fast.

## Files Changed

| File | Change |
|------|--------|
| `api/main.py` | CORS: change `allow_origins=["http://localhost:3000"]` to `allow_origins=["*"]` |

That's it -- 1 line change.

## What You'll Share on Poster/Slides
- **Live app**: `https://rag-stress-test.vercel.app`
- **Source code**: `https://github.com/<you>/rag_stress_test`

## Demo Day Checklist
- [ ] Laptop plugged in (ML inference drains battery fast)
- [ ] Ollama running, llama3.1:8b model pulled
- [ ] Backend running on port 8000
- [ ] Cloudflare tunnel running, URL noted
- [ ] Vercel env var updated with tunnel URL, redeployed
- [ ] Open app, run one warm-up question
- [ ] Pre-populate 5-10 experiments so History/Analytics pages have data

## Limitations
- Tunnel URL changes each time you restart `cloudflared` (need to update Vercel env var and redeploy -- 2 min)
- Only works while your laptop is running and connected to internet
- First request after restart is slow (model loading)

## Verification
- [ ] `curl <tunnel-url>/health` returns `{"status": "ok"}` from any device
- [ ] Open Vercel URL on your phone -- frontend loads and can run queries
- [ ] Full pipeline works: question -> retrieval -> generation -> metrics

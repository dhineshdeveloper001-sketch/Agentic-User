# ▲ Vercel Single-Service Deployment Guide

This guide walks you through deploying your **AI IT Helpdesk Agent** directly to **Vercel** as a single serverless deployment.

The application serves both the **FastAPI backend** (REST API, RAG, agent orchestration) and the **responsive dark-glassmorphism UI** from a single Vercel project with zero cold-start failures.

---

## 🚀 Quick Deployment (3 Steps)

### Step 1: Commit and Push to GitHub

From your project terminal:

```bash
git add .
git commit -m "Configure Vercel serverless deployment and optimize bundle size"
git push origin main
```

---

### Step 2: Import Project on Vercel

1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** → **Project**.
3. Locate and click **Import** next to your GitHub repository:
   - **Repository:** `dhineshdeveloper001-sketch/Agentic-User`
4. In the **Configure Project** screen:
   - **Framework Preset**: Leave as **Other** (Vercel automatically detects `vercel.json`).
   - **Root Directory**: Leave as `./` (do not change).
   - **Build & Output Settings**: Leave as default.

---

### Step 3: (Optional) Set Environment Variables

Expand the **Environment Variables** section in the Vercel dashboard if you want to configure optional settings:

| Variable Name | Value | Purpose |
| :--- | :--- | :--- |
| `OPENAI_API_KEY` | `sk-...` | *(Optional)* Connects GPT-4o-mini for natural language synthesis. (If omitted, the app uses its built-in deterministic heuristic troubleshooting engine!) |
| `OPENAI_MODEL` | `gpt-4o-mini` | *(Optional)* Model selection. |
| `CONFIDENCE_THRESHOLD` | `0.3` | Confidence cutoff for SOP matching. |

---

### Step 4: Click "Deploy" 🎉

Click the **Deploy** button. Vercel will:
1. Provision the `@vercel/python` serverless runtime.
2. Install dependencies from the optimized `requirements.txt` (< 250MB limit).
3. Bundle the static UI from `backend/static/` and runbooks from `backend/knowledge_base/sample_sops/`.
4. Provide a live URL: `https://<your-project>.vercel.app`.

---

## 🔍 Verifying Your Live Deployment

Once deployed, you can verify your service:

1. **Web UI**: Visit `https://<your-project>.vercel.app/` — you should see the live Dark-Glassmorphism IT Helpdesk chat interface.
2. **API Health Check**: Visit `https://<your-project>.vercel.app/api/health` — should return:
   ```json
   {"status": "healthy", "service": "IT Support Agent"}
   ```
3. **Interactive Swagger Docs**: Visit `https://<your-project>.vercel.app/docs` to inspect all available REST endpoints.

---

## 🛠️ How It Works Under The Hood

- **Entrypoint**: `api/index.py` routes all requests to FastAPI via `@vercel/python`.
- **Static UI**: FastAPI serves `index.html` at `/` and CSS/JS assets at `/static/*` via FastAPI `StaticFiles`.
- **Bundle Optimization**: Heavy PyTorch packages (`sentence-transformers`) were unbundled from production `requirements.txt` to keep the Lambda package strictly below AWS Lambda's 250MB uncompressed limit.
- **Resilient RAG**: The retrieval engine uses dense embeddings with an automatic in-memory keyword matching fallback so that runbooks are immediately retrievable even during serverless cold starts.
- **Local Development**: If you want PyTorch cross-encoder reranking locally, you can install the full requirements via `pip install -r requirements-full.txt`.

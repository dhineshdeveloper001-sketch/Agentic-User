# IT Support Agent

An intelligent, graph-orchestrated IT helpdesk agent with a RAG knowledge engine, deterministic tool layer, and a premium dark-themed web chat UI.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  FastAPI Application (Single Deployment on Vercel)     │
│                                                        │
│  ┌────────────────────────┐  ┌───────────────────────┐ │
│  │ Vanilla HTML / CSS / JS│  │ REST Endpoints        │ │
│  │ (Dark Glassmorphism)   │  │ /api/chat, /api/health│ │
│  └────────────────────────┘  └──────────┬────────────┘ │
│                                         │              │
│                              ┌──────────▼────────────┐ │
│                              │ LangGraph State Agent │ │
│                              └─────┬───────────┬─────┘ │
│                                    │           │       │
│                             ┌──────▼──┐    ┌───▼─────┐ │
│                             │RAG Engine│    │Tool Layer││
│                             │ChromaDB  │    │Mock Diag││
│                             └─────────┘    └─────────┘ │
└────────────────────────────────────────────────────────┘
```

## Quick Start (Single Server Deployment)

### 1. Local Setup

```bash
# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run server (serves both API & Frontend at http://localhost:8000)
python -m uvicorn backend.main:app --port 8000 --reload
```

Open `http://localhost:8000` in your browser.

### 2. Deploy to Vercel (Serverless)

This project is pre-configured with `vercel.json` and `api/index.py` for direct serverless deployment:

```bash
# Deploy with Vercel CLI
vercel
```

In your Vercel Project Settings, add any required environment variables:
- `OPENAI_API_KEY`: Your API key
- `OPENAI_BASE_URL`: (Optional) Custom or Ollama remote endpoint
- `OPENAI_MODEL`: Model name (default: `gpt-4o-mini` or your model)

### 3. Use the Agent

1. Open `http://localhost:3000` in your browser
2. Click a suggestion card or type your IT issue
   - Check for active outages
   - Search the knowledge base for matching SOPs
   - Run diagnostic tools automatically
   - Walk you through resolution steps one-by-one
   - Escalate to a support ticket if needed

## Features

### RAG Knowledge Engine
- **8 sample SOPs** covering VPN, email, passwords, printers, software, SSL, DNS, and MFA
- **Logical chunking** by section (overview, steps, escalation) — not arbitrary token counts
- **Hybrid search**: Dense semantic + keyword boost for error codes
- **Cross-encoder reranker** for precision
- **Confidence thresholding** — refuses to hallucinate if no verified runbook exists

### Tool Layer
- **Diagnostic tools** (mock): Service status, network tests, user entitlements, outage board
- **Remediation tools** (mock): DNS cache clear, Kerberos flush, spooler restart
- **Escalation tools**: Auto-generate incident tickets with handoff payload
- **Input validation**: Strict regex, whitelists, sanitization

### Agent Orchestrator (LangGraph)
- **Graph-based state machine** with conditional routing
- **Outage gate** — suppresses debugging during known incidents
- **Step-by-step checkpoints** — asks user to confirm at each fork
- **HITL gates** — pauses for approval on security-sensitive actions
- **Automatic escalation** when runbooks are exhausted

### Production Guardrails
- Tool whitelisting & input validation
- Confidence thresholding (no hallucinated commands)
- HITL approval for destructive actions
- Session state persistence

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/{id}` | Get session details |
| POST | `/api/chat` | Send message to agent |
| POST | `/api/hitl/{id}/approve` | HITL approval |
| POST | `/api/knowledge/rebuild` | Rebuild knowledge base |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM | OpenAI GPT-4o-mini |
| Orchestration | LangGraph |
| Backend | FastAPI |
| Vector DB | ChromaDB |
| Reranker | cross-encoder/ms-marco-MiniLM-L-6-v2 |
| Frontend | Next.js (React) |
| Styling | Vanilla CSS (Glassmorphism Dark Theme) |

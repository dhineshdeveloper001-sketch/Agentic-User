"""
FastAPI Backend for the IT Support Agent.

Exposes REST endpoints for the chat interface, session management,
and HITL approval flow.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.config import FRONTEND_URL, BACKEND_HOST, BACKEND_PORT
from backend.knowledge_base.ingestion import build_index
from backend.agent.service import (
    create_session,
    get_session,
    get_all_sessions,
    run_agent,
)

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-30s | %(levelname)-7s | %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the knowledge base index on startup."""
    logger.info("Starting IT Support Agent backend...")
    try:
        build_index()
        logger.info("Knowledge base index ready.")
    except Exception as e:
        logger.error(f"Failed to build index: {e}")
    yield
    logger.info("Shutting down IT Support Agent backend.")


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="IT Support Agent API",
    description="Intelligent IT helpdesk agent with RAG, diagnostics, and escalation.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static Files & Single-Page UI ────────────────────────────────────────────
_static_dir = Path(__file__).parent / "static"
if _static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")

@app.get("/", include_in_schema=False)
async def serve_index():
    """Serve the single-page vanilla HTML/CSS/JS chat interface."""
    index_path = _static_dir / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "IT Support Agent API is running. Static UI not found."}


# ── Request / Response Models ────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    session_id: str | None = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    metadata: dict[str, Any] = {}


class SessionResponse(BaseModel):
    session_id: str
    user_id: str = "default"
    message_count: int = 0
    resolved: bool = False


class HITLRequest(BaseModel):
    approved: bool


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "IT Support Agent"}


@app.post("/api/sessions", response_model=SessionResponse)
async def create_new_session():
    """Create a new support session."""
    session_id = create_session()
    return SessionResponse(session_id=session_id)


@app.get("/api/sessions", response_model=list[SessionResponse])
async def list_sessions():
    """List all active sessions."""
    sessions = get_all_sessions()
    return [SessionResponse(**s) for s in sessions]


@app.get("/api/sessions/{session_id}")
async def get_session_details(session_id: str):
    """Get session details and message history."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = []
    for msg in session["state"].get("messages", []):
        messages.append({
            "role": "user" if msg.type == "human" else "assistant",
            "content": msg.content,
        })

    return {
        "session_id": session_id,
        "messages": messages,
        "metadata": {
            "intent": session["state"].get("intent", ""),
            "resolved": session["state"].get("resolved", False),
            "current_sop": session["state"].get("current_sop", {}).get("title", "") if session["state"].get("current_sop") else None,
        },
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the IT Support Agent.
    Creates a new session if session_id is not provided.
    """
    session_id = request.session_id

    if not session_id:
        session_id = create_session()
        logger.info(f"Auto-created session: {session_id}")

    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await run_agent(session_id, request.message)

    return ChatResponse(
        response=result["response"],
        session_id=result["session_id"],
        metadata=result.get("metadata", {}),
    )


@app.post("/api/hitl/{session_id}/approve")
async def hitl_approve(session_id: str, request: HITLRequest):
    """
    Human-in-the-loop approval endpoint.
    Approve or decline a security-sensitive action.
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session["state"].get("requires_hitl"):
        raise HTTPException(
            status_code=400,
            detail="No pending HITL approval for this session",
        )

    approval_msg = "Yes, I approve this action." if request.approved else "No, please escalate this instead."
    result = await run_agent(session_id, approval_msg)

    return ChatResponse(
        response=result["response"],
        session_id=result["session_id"],
        metadata=result.get("metadata", {}),
    )


@app.post("/api/knowledge/rebuild")
async def rebuild_knowledge_base():
    """Force rebuild the knowledge base index."""
    try:
        build_index(force_rebuild=True)
        return {"status": "success", "message": "Knowledge base rebuilt."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=BACKEND_HOST,
        port=BACKEND_PORT,
        reload=True,
    )

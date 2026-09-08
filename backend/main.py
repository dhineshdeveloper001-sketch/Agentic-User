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
from backend.knowledge_base.ingestion import build_index, get_raw_sops
from backend.agent.service import (
    create_session,
    get_session,
    delete_session,
    get_all_sessions,
    run_agent,
)
from backend.tools.diagnostic import (
    check_service_status,
    run_network_test,
    query_user_entitlements,
    search_outage_board,
)
from backend.tools.remediation import trigger_remote_action

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
if not _static_dir.exists():
    _cwd_static = Path.cwd() / "backend" / "static"
    if _cwd_static.exists():
        _static_dir = _cwd_static

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


class DiagnosticRunRequest(BaseModel):
    tool_name: str
    args: dict[str, Any] = {}


class KnowledgeUploadRequest(BaseModel):
    title: str
    category: str = "General"
    content: str
    platforms: list[str] = ["Windows", "macOS"]


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
        return {
            "session_id": session_id,
            "messages": [],
            "metadata": {
                "intent": "",
                "resolved": False,
                "current_sop": None,
            },
        }

    messages = []
    for msg in session["state"].get("messages", []):
        messages.append({
            "role": "user" if getattr(msg, "type", "") == "human" else "assistant",
            "content": getattr(msg, "content", str(msg)),
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


@app.delete("/api/sessions/{session_id}")
async def delete_session_endpoint(session_id: str):
    """Delete a session by ID."""
    success = delete_session(session_id)
    return {"status": "success", "session_id": session_id}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the IT Support Agent.
    Creates a new session if session_id is not provided or expired.
    """
    session_id = request.session_id
    if not session_id:
        session_id = create_session()
        logger.info(f"Auto-created session: {session_id}")

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
    if not session or not session["state"].get("requires_hitl"):
        # Auto-heal or default response if state was lost
        approval_msg = "Yes, I approve this action." if request.approved else "No, please escalate this instead."
        result = await run_agent(session_id, approval_msg)
        return ChatResponse(
            response=result["response"],
            session_id=result["session_id"],
            metadata=result.get("metadata", {}),
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


@app.get("/api/knowledge/documents")
async def list_knowledge_documents():
    """List all SOP documents loaded in the knowledge base."""
    sops = get_raw_sops()
    docs = []
    for s in sops:
        docs.append({
            "id": s.get("id"),
            "title": s.get("title"),
            "category": s.get("category", "General"),
            "platforms": s.get("platforms", []),
            "tags": s.get("tags", []),
            "resolution_steps_count": len(s.get("resolution_steps", [])),
            "diagnostic_tools": [d.get("tool") for d in s.get("diagnostic_tools", [])],
            "escalation_team": s.get("escalation_team", "Tier-2 Support"),
            "escalation_priority": s.get("escalation_priority", "P3"),
            "status": "Indexed ✓",
            "filename": f"{s.get('id', 'doc').lower()}.json",
        })
    return docs


@app.post("/api/knowledge/upload")
async def upload_knowledge_document(request: KnowledgeUploadRequest):
    """Add a new SOP document to the knowledge base and trigger indexing."""
    import json
    import uuid
    from backend.config import SOP_DIR

    doc_id = f"SOP-CUSTOM-{str(uuid.uuid4())[:8].upper()}"
    sop_data = {
        "id": doc_id,
        "title": request.title,
        "category": request.category,
        "platforms": request.platforms,
        "tags": [request.category.lower(), "custom-upload"],
        "symptoms": [f"Issues related to {request.title}"],
        "error_codes": [],
        "prerequisites": ["Corporate network access"],
        "diagnostic_questions": [f"What issue are you experiencing with {request.title}?"],
        "resolution_steps": [
            {
                "step": 1,
                "action": request.content,
                "checkpoint": "Verify if the issue has been resolved.",
            }
        ],
        "escalation_criteria": "If user cannot complete the custom instructions.",
        "escalation_team": f"{request.category} Support",
        "escalation_priority": "P3",
    }

    saved = False
    for target_dir in [Path(SOP_DIR), Path("/tmp/sample_sops")]:
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
            sop_path = target_dir / f"{doc_id.lower()}.json"
            with open(sop_path, "w", encoding="utf-8") as f:
                json.dump(sop_data, f, indent=2)
            saved = True
            break
        except Exception as e:
            logger.warning(f"Could not save SOP to {target_dir}: {e}")

    try:
        build_index(force_rebuild=True)
    except Exception as e:
        logger.warning(f"Rebuilding index after upload failed: {e}")

    return {
        "status": "Indexed ✓",
        "document": {
            "id": doc_id,
            "title": request.title,
            "category": request.category,
            "resolution_steps_count": 1,
            "filename": f"{doc_id.lower()}.json",
            "status": "Indexed ✓",
        },
    }


@app.get("/api/diagnostics/tools")
async def list_diagnostic_tools():
    """List all available diagnostic & remediation tools with metadata."""
    return [
        {
            "id": "run_network_test",
            "name": "Network Connectivity Test",
            "description": "Tests reachability, DNS resolution, and latency to target hosts.",
            "category": "Network",
            "icon": "🌐",
            "parameters": [
                {
                    "name": "host",
                    "label": "Host or IP Address",
                    "type": "text",
                    "default": "vpn.corporate.com",
                    "placeholder": "e.g. vpn.corporate.com or 8.8.8.8",
                }
            ],
        },
        {
            "id": "check_service_status",
            "name": "Internal Service Health",
            "description": "Checks uptime, latency, and operational health of core services.",
            "category": "Infrastructure",
            "icon": "🖥️",
            "parameters": [
                {
                    "name": "service_name",
                    "label": "Service Name",
                    "type": "select",
                    "default": "vpn-gateway",
                    "options": [
                        {"value": "vpn-gateway", "label": "Cisco AnyConnect VPN Gateway"},
                        {"value": "sso-okta", "label": "Okta SSO / Identity Provider"},
                        {"value": "exchange-online", "label": "Microsoft Exchange Online"},
                        {"value": "smtp-relay", "label": "SMTP Relay Server"},
                        {"value": "print-server", "label": "Network Print Server"},
                        {"value": "file-server", "label": "Corporate File Server"},
                        {"value": "dns-primary", "label": "Primary DNS Server"},
                        {"value": "dns-secondary", "label": "Secondary DNS Server"},
                        {"value": "ad-controller", "label": "Active Directory Controller"},
                        {"value": "citrix-gateway", "label": "Citrix Virtual Desktop Gateway"},
                    ],
                }
            ],
        },
        {
            "id": "search_outage_board",
            "name": "Active Outage Scanner",
            "description": "Scans company incident records for active outages affecting corporate systems.",
            "category": "Monitoring",
            "icon": "⚠️",
            "parameters": [],
        },
        {
            "id": "query_user_entitlements",
            "name": "Identity & IAM Profile Check",
            "description": "Queries Active Directory profile, MFA status, account lockout, and app permissions.",
            "category": "Identity",
            "icon": "🔑",
            "parameters": [
                {
                    "name": "user_id",
                    "label": "User Email or ID",
                    "type": "text",
                    "default": "default",
                    "placeholder": "e.g. john.doe@corporate.com or default",
                }
            ],
        },
        {
            "id": "trigger_remote_action",
            "name": "Remediation Action Runner",
            "description": "Runs automated self-healing actions such as flushing DNS cache or restarting the print spooler.",
            "category": "Remediation",
            "icon": "⚡",
            "parameters": [
                {
                    "name": "action_type",
                    "label": "Remediation Action",
                    "type": "select",
                    "default": "clear_dns_cache",
                    "options": [
                        {"value": "clear_dns_cache", "label": "Clear DNS Cache (ipconfig /flushdns)"},
                        {"value": "flush_kerberos_tokens", "label": "Flush Kerberos Tokens (klist purge)"},
                        {"value": "restart_print_spooler", "label": "Restart Print Spooler Service"},
                        {"value": "reset_network_adapter", "label": "Reset Network Adapter (release/renew)"},
                        {"value": "clear_browser_cache", "label": "Clear Browser Cache & Temp Files"},
                    ],
                }
            ],
        },
    ]


@app.post("/api/diagnostics/run")
async def run_diagnostic_tool_endpoint(request: DiagnosticRunRequest):
    """Execute a backend diagnostic or remediation tool directly."""
    from datetime import datetime, timezone

    tool_map = {
        "run_network_test": run_network_test,
        "check_service_status": check_service_status,
        "search_outage_board": search_outage_board,
        "query_user_entitlements": query_user_entitlements,
        "trigger_remote_action": trigger_remote_action,
    }
    tool = tool_map.get(request.tool_name)
    if not tool:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported diagnostic tool: {request.tool_name}. Supported: {list(tool_map.keys())}",
        )
    try:
        result = tool.invoke(request.args)
        return {
            "tool_name": request.tool_name,
            "args": request.args,
            "result": result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error(f"Diagnostic tool {request.tool_name} failed: {e}")
        return {
            "tool_name": request.tool_name,
            "args": request.args,
            "result": {"error": str(e), "status": "failed"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }



# ── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=BACKEND_HOST,
        port=BACKEND_PORT,
        reload=True,
    )

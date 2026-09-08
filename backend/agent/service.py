"""
Agent Service — Graph Builder & Runner.

Exposes a high-level interface for running the IT Support Agent.
Manages session state and graph compilation.
"""

import logging
import uuid
from typing import Any

from langchain_core.messages import HumanMessage

from backend.agent.state import AgentState
from backend.agent.graph import build_graph

logger = logging.getLogger(__name__)

# ── Session Store ────────────────────────────────────────────────────────────
# In production, this would use a database. For development, in-memory dict.
_sessions: dict[str, dict[str, Any]] = {}


def _get_compiled_graph():
    """Build and compile the graph (cached)."""
    graph = build_graph()
    return graph.compile()


# Module-level compiled graph
_compiled_graph = None


def get_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = _get_compiled_graph()
    return _compiled_graph


def create_session(user_id: str = "default", session_id: str | None = None) -> str:
    """Create a new support session and return its ID."""
    sid = session_id or str(uuid.uuid4())
    _sessions[sid] = {
        "session_id": sid,
        "user_id": user_id,
        "state": {
            "messages": [],
            "user_input": "",
            "user_context": {"user_id": user_id},
            "intent": "",
            "symptom_summary": "",
            "platform": "unknown",
            "error_codes": [],
            "current_sop": None,
            "current_step": 0,
            "diagnostic_results": [],
            "attempted_steps": [],
            "confidence_score": 0.0,
            "retrieved_chunks": [],
            "requires_hitl": False,
            "hitl_approved": False,
            "resolved": False,
            "active_outage": None,
            "should_escalate": False,
            "ticket_info": None,
            "next_node": "",
        },
        "is_continuing": False,
    }
    logger.info(f"Session created: {sid}")
    return sid


def get_session(session_id: str) -> dict[str, Any] | None:
    """Retrieve a session by ID."""
    return _sessions.get(session_id)


def get_or_create_session(session_id: str, user_id: str = "default") -> dict[str, Any]:
    """Retrieve an existing session or auto-initialize one for serverless resiliency."""
    session = _sessions.get(session_id)
    if not session:
        create_session(user_id=user_id, session_id=session_id)
        session = _sessions[session_id]
    return session


def delete_session(session_id: str) -> bool:
    """Delete a session from memory."""
    if session_id in _sessions:
        del _sessions[session_id]
        logger.info(f"Session deleted: {session_id}")
        return True
    return False


def get_all_sessions() -> list[dict[str, Any]]:
    """Get summary info of all sessions."""
    return [
        {
            "session_id": s["session_id"],
            "user_id": s["user_id"],
            "message_count": len(s["state"].get("messages", [])),
            "resolved": s["state"].get("resolved", False),
        }
        for s in _sessions.values()
    ]


async def run_agent(session_id: str, user_message: str) -> dict[str, Any]:
    """
    Run the agent for a single turn.

    For the first message, runs the full graph (intake → outage → retrieval → etc).
    For subsequent messages, runs from process_user_response node.

    Args:
        session_id: The session identifier.
        user_message: The user's message text.

    Returns:
        Dict with the agent's response and metadata.
    """
    session = get_or_create_session(session_id)
    state = session["state"]
    is_continuing = session["is_continuing"]

    # Add user message to state
    state["user_input"] = user_message
    state["messages"].append(HumanMessage(content=user_message))

    graph = get_graph()

    try:
        if not is_continuing:
            # First message — run full graph from entry point
            result = graph.invoke(state)
            session["is_continuing"] = True
        else:
            # Continuing conversation — check if HITL approval
            if state.get("requires_hitl"):
                approval_words = {"yes", "approve", "confirm", "proceed", "ok", "go ahead"}
                if any(w in user_message.lower() for w in approval_words):
                    state["hitl_approved"] = True
                    state["requires_hitl"] = False
                    result = graph.invoke(state)
                else:
                    # User declined — escalate
                    state["should_escalate"] = True
                    state["next_node"] = "escalation"
                    from backend.agent.nodes import escalation_node
                    esc_result = escalation_node(state)
                    state.update(esc_result)
                    result = state
            else:
                # Process user response and continue
                from backend.agent.nodes import process_user_response_node
                response_result = process_user_response_node(state)
                state.update(response_result)

                next_node = state.get("next_node", "")
                if next_node == "resolution":
                    from backend.agent.nodes import resolution_node
                    res_result = resolution_node(state)
                    state.update(res_result)
                    result = state
                elif next_node == "escalation":
                    from backend.agent.nodes import escalation_node
                    esc_result = escalation_node(state)
                    state.update(esc_result)
                    result = state
                elif next_node == "present_step":
                    from backend.agent.nodes import present_step_node
                    step_result = present_step_node(state)
                    state.update(step_result)
                    result = state
                else:
                    result = graph.invoke(state)

        # Update session state
        if isinstance(result, dict):
            for key in state:
                if key in result:
                    state[key] = result[key]

        # Extract the latest AI message
        messages = state.get("messages", [])
        ai_messages = [m for m in messages if hasattr(m, "type") and m.type == "ai"]
        latest_response = ai_messages[-1].content if ai_messages else "I'm processing your request..."

        # Build sources from retrieved chunks
        retrieved_chunks = state.get("retrieved_chunks", [])
        sources = []
        for c in retrieved_chunks:
            meta = c.get("metadata", {})
            title = meta.get("title") or meta.get("sop_title") or meta.get("sop_id") or "SOP Document"
            sources.append({
                "title": title,
                "sop_id": meta.get("sop_id", ""),
                "category": meta.get("category", "General"),
                "platforms": meta.get("platforms", ""),
                "chunk_type": meta.get("chunk_type", "section"),
                "score": round(float(c.get("score", 0.0)), 3) if c.get("score") is not None else 0.0,
                "snippet": (c.get("text", "")[:280] + "...") if len(c.get("text", "")) > 280 else c.get("text", ""),
            })

        # Build response metadata
        response = {
            "response": latest_response,
            "session_id": session_id,
            "metadata": {
                "intent": state.get("intent", ""),
                "confidence": state.get("confidence_score", 0.0),
                "has_sop": state.get("current_sop") is not None,
                "sop_title": state.get("current_sop", {}).get("title", "") if state.get("current_sop") else "",
                "current_step": state.get("current_step", 0),
                "total_steps": len(state.get("current_sop", {}).get("resolution_steps", [])) if state.get("current_sop") else 0,
                "resolved": state.get("resolved", False),
                "requires_hitl": state.get("requires_hitl", False),
                "has_active_outage": state.get("active_outage") is not None,
                "ticket_info": state.get("ticket_info"),
                "diagnostic_results": state.get("diagnostic_results", []),
                "sources": sources,
            },
        }

        return response

    except Exception as e:
        logger.error(f"Agent error: {e}", exc_info=True)
        error_msg = (
            "I apologize, but I encountered an internal error processing "
            "your request. Let me create a support ticket so a human agent "
            "can assist you.\n\n"
            f"Error: {str(e)[:200]}"
        )
        return {
            "response": error_msg,
            "session_id": session_id,
            "metadata": {"error": str(e)},
        }

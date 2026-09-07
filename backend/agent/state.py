"""
Agent State Definition.

Defines the shared state that flows through the LangGraph
state machine. Every node reads from and writes to this state.
"""

from typing import Annotated, Any
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """
    Shared state for the IT Support Agent graph.

    Attributes:
        messages: Conversation history (appended via add_messages reducer).
        user_input: The latest user message text.
        user_context: Session metadata — user_id, device, platform, etc.
        intent: Classified intent — "diagnostic", "action", "question", "escalation".
        symptom_summary: Extracted root symptom from user message.
        platform: Detected platform (Windows, macOS, Linux, iOS, Android).
        error_codes: Any error codes extracted from user input.
        current_sop: The active SOP being followed (raw JSON dict).
        current_step: The current step index in the SOP resolution flow.
        diagnostic_results: Results from tool executions.
        attempted_steps: Steps tried so far (for escalation handoff).
        confidence_score: RAG retrieval confidence.
        retrieved_chunks: Retrieved knowledge chunks from RAG.
        requires_hitl: Whether human-in-the-loop approval is needed.
        hitl_approved: Whether the user approved a HITL action.
        resolved: Whether the issue is resolved.
        active_outage: Matched outage from outage board.
        should_escalate: Whether the agent should escalate to Tier-2.
        ticket_info: Created ticket details.
        next_node: Explicit routing override for conditional edges.
    """

    messages: Annotated[list, add_messages]
    user_input: str
    user_context: dict[str, Any]
    intent: str
    symptom_summary: str
    platform: str
    error_codes: list[str]
    current_sop: dict[str, Any] | None
    current_step: int
    diagnostic_results: list[dict[str, Any]]
    attempted_steps: list[str]
    confidence_score: float
    retrieved_chunks: list[dict[str, Any]]
    requires_hitl: bool
    hitl_approved: bool
    resolved: bool
    active_outage: dict[str, Any] | None
    should_escalate: bool
    ticket_info: dict[str, Any] | None
    next_node: str

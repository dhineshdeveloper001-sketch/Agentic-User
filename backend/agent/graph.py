"""
LangGraph State Machine Definition.

Builds the graph-based agent orchestrator with conditional
edges for the IT support workflow.
"""

import logging
from langgraph.graph import StateGraph, END

from backend.agent.state import AgentState
from backend.agent.nodes import (
    intake_node,
    outage_gate_node,
    knowledge_retrieval_node,
    diagnostic_loop_node,
    present_step_node,
    user_checkpoint_node,
    process_user_response_node,
    hitl_gate_node,
    no_runbook_node,
    escalation_node,
    resolution_node,
)

logger = logging.getLogger(__name__)


def _route_after_outage(state: AgentState) -> str:
    """Route after the outage gate check."""
    next_node = state.get("next_node", "knowledge_retrieval")
    if next_node == "end":
        return END
    return next_node


def _route_after_knowledge(state: AgentState) -> str:
    """Route after knowledge retrieval."""
    return state.get("next_node", "present_step")


def _route_after_present(state: AgentState) -> str:
    """Route after presenting a step."""
    next_node = state.get("next_node", "user_checkpoint")
    if next_node == "hitl_gate":
        return "hitl_gate"
    if next_node == "escalation":
        return "escalation"
    return "user_checkpoint"


def _route_after_user_response(state: AgentState) -> str:
    """Route after processing user's response."""
    next_node = state.get("next_node", "present_step")
    if next_node == "resolution":
        return "resolution"
    if next_node == "escalation":
        return "escalation"
    return "present_step"


def _route_after_hitl(state: AgentState) -> str:
    """Route after HITL gate."""
    next_node = state.get("next_node", "waiting_for_hitl")
    if next_node == "present_step":
        return "present_step"
    # Default: end to wait for user HITL approval
    return END


def build_graph() -> StateGraph:
    """
    Build and compile the IT Support Agent state graph.

    Flow:
        intake → outage_gate → knowledge_retrieval → diagnostic_loop
        → present_step → user_checkpoint → (wait for user)
        → process_user_response → (next_step | resolution | escalation)
    """

    graph = StateGraph(AgentState)

    # ── Add Nodes ────────────────────────────────────────────────────────
    graph.add_node("intake", intake_node)
    graph.add_node("outage_gate", outage_gate_node)
    graph.add_node("knowledge_retrieval", knowledge_retrieval_node)
    graph.add_node("diagnostic_loop", diagnostic_loop_node)
    graph.add_node("present_step", present_step_node)
    graph.add_node("user_checkpoint", user_checkpoint_node)
    graph.add_node("process_user_response", process_user_response_node)
    graph.add_node("hitl_gate", hitl_gate_node)
    graph.add_node("no_runbook", no_runbook_node)
    graph.add_node("escalation", escalation_node)
    graph.add_node("resolution", resolution_node)

    # ── Set Entry Point ──────────────────────────────────────────────────
    graph.set_entry_point("intake")

    # ── Add Edges ────────────────────────────────────────────────────────

    # intake → outage_gate (always)
    graph.add_edge("intake", "outage_gate")

    # outage_gate → (end if outage matched) or knowledge_retrieval
    graph.add_conditional_edges(
        "outage_gate",
        _route_after_outage,
        {
            "knowledge_retrieval": "knowledge_retrieval",
            END: END,
        },
    )

    # knowledge_retrieval → (diagnostic_loop | present_step | no_runbook)
    graph.add_conditional_edges(
        "knowledge_retrieval",
        _route_after_knowledge,
        {
            "diagnostic_loop": "diagnostic_loop",
            "present_step": "present_step",
            "no_runbook": "no_runbook",
        },
    )

    # diagnostic_loop → present_step (always)
    graph.add_edge("diagnostic_loop", "present_step")

    # present_step → (user_checkpoint | hitl_gate | escalation)
    graph.add_conditional_edges(
        "present_step",
        _route_after_present,
        {
            "user_checkpoint": "user_checkpoint",
            "hitl_gate": "hitl_gate",
            "escalation": "escalation",
        },
    )

    # user_checkpoint → END (waits for next user message)
    graph.add_edge("user_checkpoint", END)

    # process_user_response → (present_step | resolution | escalation)
    graph.add_conditional_edges(
        "process_user_response",
        _route_after_user_response,
        {
            "present_step": "present_step",
            "resolution": "resolution",
            "escalation": "escalation",
        },
    )

    # hitl_gate → (present_step | END)
    graph.add_conditional_edges(
        "hitl_gate",
        _route_after_hitl,
        {
            "present_step": "present_step",
            END: END,
        },
    )

    # no_runbook → user_checkpoint
    graph.add_edge("no_runbook", END)

    # Terminal nodes
    graph.add_edge("escalation", END)
    graph.add_edge("resolution", END)

    return graph

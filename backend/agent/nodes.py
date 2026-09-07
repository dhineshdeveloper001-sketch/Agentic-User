"""
Agent Node Functions.

Each function corresponds to a node in the LangGraph state machine.
Nodes read from the shared AgentState and return state updates.
"""

import json
import logging
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from backend.config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, OPENAI_TEMPERATURE
from backend.agent.state import AgentState
from backend.knowledge_base.retriever import get_retriever
from backend.tools.diagnostic import (
    check_service_status,
    run_network_test,
    query_user_entitlements,
    search_outage_board,
)
from backend.tools.remediation import trigger_remote_action
from backend.tools.escalation import create_service_ticket

logger = logging.getLogger(__name__)

# ── LLM Instance ────────────────────────────────────────────────────────────

def _get_llm() -> ChatOpenAI | None:
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("sk-your") or not OPENAI_API_KEY.strip():
        return None
    try:
        kwargs = {
            "model": OPENAI_MODEL,
            "temperature": OPENAI_TEMPERATURE,
            "api_key": OPENAI_API_KEY,
        }
        if OPENAI_BASE_URL and OPENAI_BASE_URL.strip():
            kwargs["base_url"] = OPENAI_BASE_URL.strip()
        return ChatOpenAI(**kwargs)
    except Exception as e:
        logger.warning(f"Could not initialize ChatOpenAI: {e}")
        return None


# ── System Prompts ──────────────────────────────────────────────────────────

INTAKE_PROMPT = """You are an IT Support Agent intake classifier.

Analyze the user's message and extract:
1. "symptom_summary": A concise summary of the root problem (1-2 sentences)
2. "platform": The user's OS/platform if mentioned (Windows, macOS, Linux, iOS, Android) or "unknown"
3. "error_codes": A list of any error codes, error messages, or technical identifiers mentioned
4. "intent": Classify as one of:
   - "diagnostic": User has a technical problem that needs troubleshooting
   - "action": User wants a specific action performed (reset, restart, etc.)
   - "question": User has an informational question about IT policy/services
   - "escalation": User explicitly wants to escalate or create a ticket

Respond with ONLY a JSON object. No markdown, no code blocks.
Example: {"symptom_summary": "Cannot connect to VPN", "platform": "Windows", "error_codes": ["Connection timed out"], "intent": "diagnostic"}"""

RESPONSE_PROMPT = """You are a friendly, professional IT Support Agent for a large corporation.

GUIDELINES:
- Be concise but helpful. Use a warm, professional tone.
- Present troubleshooting steps one at a time, not all at once.
- After each step, ask the user to confirm the outcome before proceeding.
- If you have diagnostic tool results, interpret them clearly for the user.
- Never fabricate technical commands — only recommend steps from verified SOPs.
- If you don't have a verified procedure, be transparent and offer to create a ticket.

CONTEXT:
{context}

Respond naturally as a helpful IT support technician. Do not use JSON formatting in your response to the user."""


# ── Node Functions ──────────────────────────────────────────────────────────

def _heuristic_intake(user_input: str) -> dict[str, Any]:
    """Rule-based heuristic classifier when LLM is unavailable."""
    lower = user_input.lower()
    
    # Platform detection
    platform = "unknown"
    if "windows" in lower or "win11" in lower or "win10" in lower or "pc" in lower:
        platform = "Windows"
    elif "mac" in lower or "macos" in lower or "osx" in lower or "apple" in lower:
        platform = "macOS"
    elif "linux" in lower or "ubuntu" in lower:
        platform = "Linux"
    elif "ios" in lower or "iphone" in lower or "ipad" in lower:
        platform = "iOS"
    elif "android" in lower:
        platform = "Android"

    # Intent detection
    if any(w in lower for w in ["escalate", "ticket", "human", "specialist", "agent"]):
        intent = "escalation"
    elif any(w in lower for w in ["flush", "clear", "restart", "reset", "reboot"]):
        intent = "action"
    elif any(w in lower for w in ["policy", "how to", "what is", "where is", "how do i"]):
        intent = "question"
    else:
        intent = "diagnostic"

    # Error code extraction
    error_codes = []
    import re
    matches = re.findall(r"(?:error|code|err)[:\s]+([a-zA-Z0-9_\-]+)", lower)
    if matches:
        error_codes.extend(matches)

    return {
        "intent": intent,
        "symptom_summary": user_input[:200].strip(),
        "platform": platform,
        "error_codes": error_codes,
        "user_input": user_input,
    }


def intake_node(state: AgentState) -> dict[str, Any]:
    """
    Extract intent, symptom, platform, and error codes from user message.
    """
    user_input = state.get("user_input", "")
    if not user_input:
        messages = state.get("messages", [])
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                user_input = msg.content
                break

    if not user_input:
        return {
            "intent": "question",
            "symptom_summary": "",
            "platform": "unknown",
            "error_codes": [],
        }

    llm = _get_llm()
    if llm is None:
        return _heuristic_intake(user_input)

    try:
        response = llm.invoke([
            SystemMessage(content=INTAKE_PROMPT),
            HumanMessage(content=user_input),
        ])

        content = response.content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        if content.startswith("json"):
            content = content[4:].strip()

        parsed = json.loads(content)

        return {
            "intent": parsed.get("intent", "diagnostic"),
            "symptom_summary": parsed.get("symptom_summary", user_input[:200]),
            "platform": parsed.get("platform", "unknown"),
            "error_codes": parsed.get("error_codes", []),
            "user_input": user_input,
        }
    except Exception as e:
        logger.warning(f"Intake parsing failed via LLM, falling back to heuristics: {e}")
        return _heuristic_intake(user_input)


def outage_gate_node(state: AgentState) -> dict[str, Any]:
    """
    Check the outage board before attempting individual troubleshooting.
    If a matching outage is found, suppress debugging.
    """
    result = search_outage_board.invoke({})

    if result.get("has_active_outage"):
        outages = result.get("outages", [])
        symptom = state.get("symptom_summary", "").lower()

        for outage in outages:
            # Check if the outage matches the user's symptom
            outage_symptoms = [s.lower() for s in outage.get("symptoms", [])]
            affected = [s.lower() for s in outage.get("affected_services", [])]

            if any(s in symptom for s in outage_symptoms) or \
               any(s in symptom for s in affected):
                msg = (
                    f"🚨 **Active Incident Detected**\n\n"
                    f"**{outage['title']}**\n"
                    f"- **Status:** {outage['status']}\n"
                    f"- **Severity:** {outage['severity']}\n"
                    f"- **Started:** {outage['started_at']}\n\n"
                    f"{outage['description']}\n\n"
                    f"This is a known issue being worked on by our infrastructure team. "
                    f"Individual troubleshooting is not needed at this time. "
                    f"I'll keep you updated when the issue is resolved."
                )
                return {
                    "active_outage": outage,
                    "messages": [AIMessage(content=msg)],
                    "next_node": "end",
                }

    return {"active_outage": None, "next_node": "knowledge_retrieval"}


def knowledge_retrieval_node(state: AgentState) -> dict[str, Any]:
    """
    Query the RAG pipeline for relevant SOPs based on the symptom and platform.
    """
    symptom = state.get("symptom_summary", "")
    platform = state.get("platform", "unknown")
    error_codes = state.get("error_codes", [])

    # Build enriched query
    query_parts = [symptom]
    if error_codes:
        query_parts.extend(error_codes)
    if platform and platform != "unknown":
        query_parts.append(platform)
    query = " ".join(query_parts)

    retriever = get_retriever()
    response = retriever.retrieve(
        query=query,
        platform=platform if platform != "unknown" else None,
    )

    chunks = [
        {
            "chunk_id": r.chunk_id,
            "text": r.text,
            "metadata": r.metadata,
            "score": r.rerank_score or r.semantic_score,
        }
        for r in response.results
    ]

    # Extract the SOP ID from the best result to load the full SOP
    current_sop = None
    if response.has_verified_runbook and chunks:
        sop_id = chunks[0]["metadata"].get("sop_id")
        if sop_id:
            from backend.knowledge_base.ingestion import get_raw_sops
            for sop in get_raw_sops():
                if sop["id"] == sop_id:
                    current_sop = sop
                    break

    if not response.has_verified_runbook:
        next_node = "no_runbook"
    elif current_sop and current_sop.get("diagnostic_tools"):
        next_node = "diagnostic_loop"
    else:
        next_node = "present_step"

    return {
        "retrieved_chunks": chunks,
        "confidence_score": response.confidence,
        "current_sop": current_sop,
        "current_step": 0,
        "next_node": next_node,
    }


def diagnostic_loop_node(state: AgentState) -> dict[str, Any]:
    """
    Execute read-only diagnostic tools autonomously to verify root cause.
    """
    sop = state.get("current_sop", {})
    if not sop:
        return {"next_node": "present_step", "diagnostic_results": []}

    diag_tools = sop.get("diagnostic_tools", [])
    results = []

    for tool_spec in diag_tools:
        tool_name = tool_spec.get("tool", "")
        tool_args = tool_spec.get("args", {})
        purpose = tool_spec.get("purpose", "")

        try:
            if tool_name == "check_service_status":
                result = check_service_status.invoke(tool_args)
            elif tool_name == "run_network_test":
                result = run_network_test.invoke(tool_args)
            elif tool_name == "query_user_entitlements":
                result = query_user_entitlements.invoke(tool_args)
            else:
                result = {"error": f"Unknown tool: {tool_name}"}

            results.append({
                "tool": tool_name,
                "purpose": purpose,
                "args": tool_args,
                "result": result,
            })
        except Exception as e:
            logger.error(f"Tool {tool_name} failed: {e}")
            results.append({
                "tool": tool_name,
                "purpose": purpose,
                "args": tool_args,
                "result": {"error": str(e)},
            })

    return {
        "diagnostic_results": results,
        "next_node": "present_step",
    }


def present_step_node(state: AgentState) -> dict[str, Any]:
    """
    Present the current troubleshooting step to the user.
    Formats bite-sized instructions with context from diagnostics.
    """
    sop = state.get("current_sop")
    current_step = state.get("current_step", 0)
    diag_results = state.get("diagnostic_results", [])
    symptom = state.get("symptom_summary", "the issue you're experiencing")

    # Build context for the LLM
    context_parts = [f"User's issue: {symptom}"]

    if diag_results:
        context_parts.append("\nDiagnostic Results:")
        for dr in diag_results:
            context_parts.append(
                f"  - {dr['purpose']}: {json.dumps(dr['result'], indent=2)}"
            )

    if sop:
        steps = sop.get("resolution_steps", [])
        if current_step < len(steps):
            step_data = steps[current_step]
            context_parts.append(
                f"\nCurrent SOP: {sop['title']}"
            )
            context_parts.append(
                f"Step {step_data['step']}: {step_data['action']}"
            )
            context_parts.append(
                f"Checkpoint: {step_data.get('checkpoint', 'N/A')}"
            )

            # Check if this step requires HITL
            if step_data.get("requires_hitl"):
                return {
                    "requires_hitl": True,
                    "next_node": "hitl_gate",
                    "messages": [AIMessage(content=(
                        f"⚠️ **Approval Required**\n\n"
                        f"The next step involves a security-sensitive action: "
                        f"**{step_data['action'][:100]}**\n\n"
                        f"This requires your explicit approval before I can proceed. "
                        f"Please confirm you'd like to continue, or I can create a "
                        f"support ticket instead."
                    ))],
                }

            # Check if step has an auto_tool
            auto_result = None
            if step_data.get("auto_tool"):
                tool_spec = step_data["auto_tool"]
                try:
                    auto_result = trigger_remote_action.invoke(tool_spec.get("args", {}))
                    context_parts.append(
                        f"\nAutomated action result: {json.dumps(auto_result, indent=2)}"
                    )
                except Exception as e:
                    context_parts.append(f"\nAutomated action failed: {e}")

            # Track attempted step
            attempted = state.get("attempted_steps", [])
            attempted.append(f"Step {step_data['step']}: {step_data['action'][:100]}")

            context = "\n".join(context_parts)

            llm = _get_llm()
            response = llm.invoke([
                SystemMessage(content=RESPONSE_PROMPT.format(context=context)),
                *state.get("messages", [])[-6:],
            ])

            return {
                "messages": [AIMessage(content=response.content)],
                "attempted_steps": attempted,
                "current_step": current_step,
                "next_node": "user_checkpoint",
            }
        else:
            # All steps exhausted
            return {
                "should_escalate": True,
                "next_node": "escalation",
            }

    # No SOP — generate a general response from retrieved chunks
    if state.get("retrieved_chunks"):
        context_parts.append("\nRelevant Knowledge Base Content:")
        for chunk in state.get("retrieved_chunks", [])[:3]:
            context_parts.append(f"  {chunk['text'][:500]}")

    context = "\n".join(context_parts)
    llm = _get_llm()
    response = llm.invoke([
        SystemMessage(content=RESPONSE_PROMPT.format(context=context)),
        *state.get("messages", [])[-6:],
    ])

    return {
        "messages": [AIMessage(content=response.content)],
        "next_node": "user_checkpoint",
    }


def user_checkpoint_node(state: AgentState) -> dict[str, Any]:
    """
    Wait for user confirmation at decision forks.
    This is a passthrough — the actual waiting happens in the
    conversation loop in the service layer.
    """
    # This node just marks that we're waiting for user input
    return {"next_node": "waiting_for_user"}


def process_user_response_node(state: AgentState) -> dict[str, Any]:
    """
    Process the user's response after a checkpoint.
    Determine if the issue is resolved, needs the next step, or escalation.
    """
    user_input = state.get("user_input", "").lower()
    sop = state.get("current_sop")
    current_step = state.get("current_step", 0)

    # Use LLM to classify the user's response
    llm = _get_llm()
    classify_prompt = """Analyze the user's response to a troubleshooting checkpoint.
Classify as ONE of:
- "resolved": The user confirms the step worked / issue is fixed
- "not_resolved": The step didn't work, need to try next step
- "escalate": User wants to give up and create a ticket
- "continue": User is providing additional info or asking a follow-up question

Respond with ONLY a JSON object: {"classification": "resolved|not_resolved|escalate|continue"}"""

    try:
        response = llm.invoke([
            SystemMessage(content=classify_prompt),
            HumanMessage(content=user_input),
        ])
        content = response.content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        if content.startswith("json"):
            content = content[4:].strip()

        classification = json.loads(content).get("classification", "continue")
    except Exception:
        classification = "continue"

    if classification == "resolved":
        return {
            "resolved": True,
            "next_node": "resolution",
            "messages": [AIMessage(content=(
                "🎉 **Great news!** I'm glad we got that resolved.\n\n"
                "Is there anything else I can help you with today?"
            ))],
        }
    elif classification == "escalate":
        return {
            "should_escalate": True,
            "next_node": "escalation",
        }
    elif classification == "not_resolved" and sop:
        # Move to next step
        steps = sop.get("resolution_steps", [])
        next_step = current_step + 1

        # Check for branch_on_fail
        if current_step < len(steps):
            branch = steps[current_step].get("branch_on_fail")
            if branch == "escalation":
                return {
                    "should_escalate": True,
                    "next_node": "escalation",
                }
            elif branch and branch.startswith("step_"):
                try:
                    next_step = int(branch.split("_")[1]) - 1
                except ValueError:
                    pass

        if next_step < len(steps):
            return {
                "current_step": next_step,
                "next_node": "present_step",
            }
        else:
            return {
                "should_escalate": True,
                "next_node": "escalation",
            }
    else:
        # "continue" — process as a new input through the flow
        return {
            "next_node": "present_step",
        }


def hitl_gate_node(state: AgentState) -> dict[str, Any]:
    """
    Human-in-the-loop approval gate.
    Pauses execution until the user explicitly approves.
    """
    if state.get("hitl_approved"):
        return {
            "requires_hitl": False,
            "hitl_approved": False,
            "next_node": "present_step",
        }

    return {
        "next_node": "waiting_for_hitl",
    }


def no_runbook_node(state: AgentState) -> dict[str, Any]:
    """
    Handle the case where no verified SOP exists for the user's issue.
    Offers to create a ticket rather than hallucinating instructions.
    """
    symptom = state.get("symptom_summary", "your issue")
    confidence = state.get("confidence_score", 0.0)

    msg = (
        f"I've searched our knowledge base but couldn't find a verified "
        f"procedure that matches **{symptom}** "
        f"(confidence: {confidence:.0%}).\n\n"
        f"I don't want to give you unverified instructions that might "
        f"make things worse. Here's what I can do:\n\n"
        f"1. **Create a support ticket** — I'll include all the details "
        f"you've shared so a specialist can help you directly.\n"
        f"2. **Try rephrasing** — If you can share more details like error "
        f"codes or when the issue started, I might find a matching procedure.\n\n"
        f"What would you prefer?"
    )

    return {
        "messages": [AIMessage(content=msg)],
        "next_node": "user_checkpoint",
    }


def escalation_node(state: AgentState) -> dict[str, Any]:
    """
    Escalate to Tier-2 by creating a structured ticket with all
    attempted steps and diagnostic results.
    """
    symptom = state.get("symptom_summary", "Unspecified IT issue")
    sop = state.get("current_sop", {})
    attempted = state.get("attempted_steps", [])
    diag_results = state.get("diagnostic_results", [])

    # Build the attempted steps summary
    steps_summary = ""
    if attempted:
        steps_summary = "Steps attempted by automated agent:\n"
        for step in attempted:
            steps_summary += f"  - {step}\n"

    if diag_results:
        steps_summary += "\nDiagnostic results:\n"
        for dr in diag_results:
            status = dr.get("result", {}).get("status", "unknown")
            steps_summary += f"  - {dr['purpose']}: {status}\n"

    category = sop.get("category", "General") if sop else "General"
    priority = sop.get("escalation_priority", "P3") if sop else "P3"

    ticket_result = create_service_ticket.invoke({
        "issue_summary": symptom,
        "priority": priority,
        "attempted_steps": steps_summary,
        "category": category,
        "affected_service": sop.get("tags", [""])[0] if sop else "",
    })

    msg = (
        f"📋 **Support Ticket Created**\n\n"
        f"I've escalated your issue to our specialist team.\n\n"
        f"- **Ticket ID:** {ticket_result.get('ticket_id', 'N/A')}\n"
        f"- **Priority:** {ticket_result.get('priority', 'P3')}\n"
        f"- **Assigned To:** {ticket_result.get('assigned_team', 'IT Support')}\n"
        f"- **Expected Response:** {ticket_result.get('estimated_response', 'TBD')}\n\n"
        f"All the troubleshooting steps we've tried and diagnostic results "
        f"have been attached to the ticket for the specialist.\n\n"
        f"Is there anything else I can help you with?"
    )

    return {
        "ticket_info": ticket_result,
        "messages": [AIMessage(content=msg)],
        "next_node": "end",
    }


def resolution_node(state: AgentState) -> dict[str, Any]:
    """
    Log the resolution for knowledge-base gap analysis.
    """
    logger.info(
        f"Issue resolved — symptom: {state.get('symptom_summary')}, "
        f"SOP: {state.get('current_sop', {}).get('id', 'N/A')}, "
        f"steps: {len(state.get('attempted_steps', []))}"
    )
    return {
        "resolved": True,
        "next_node": "end",
    }

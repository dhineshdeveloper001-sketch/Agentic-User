"""
Escalation Tools — Ticket Creation & Handoff.

Creates structured incident tickets when self-service
resolution fails, capturing all attempted steps for
seamless Tier-2 handoff.
"""

import random
import logging
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

from backend.tools.validators import (
    validate_priority,
    validate_text_field,
    ValidationError,
)

logger = logging.getLogger(__name__)


@tool
def create_service_ticket(
    issue_summary: str,
    priority: str = "P3",
    attempted_steps: str = "",
    category: str = "General",
    affected_service: str = "",
) -> dict[str, Any]:
    """
    Create an IT service incident ticket for escalation to Tier-2 support.

    Args:
        issue_summary: A clear summary of the issue being escalated.
        priority: Priority level — P1 (critical), P2 (high), P3 (medium), P4 (low).
        attempted_steps: Description of all troubleshooting steps already attempted.
        category: Issue category (Network, Email, Identity & Access, etc.)
        affected_service: The service affected by this issue.

    Returns:
        Created ticket details including ticket ID, assigned team, and ETA.
    """
    try:
        issue_summary = validate_text_field(issue_summary, "issue_summary", 500)
        priority = validate_priority(priority)
        attempted_steps = validate_text_field(attempted_steps, "attempted_steps", 2000)
        category = validate_text_field(category, "category", 100)
    except ValidationError as e:
        return {"error": str(e), "status": "validation_failed"}

    # Generate mock ticket
    ticket_number = f"INC{random.randint(10000000, 99999999)}"

    # Route based on category
    routing_map = {
        "Network": "Network Infrastructure",
        "Email": "Messaging & Collaboration",
        "Identity & Access": "Identity & Access Management",
        "Security": "Security & PKI",
        "Hardware": "Desktop Support",
        "Software": "Desktop Engineering",
    }
    assigned_team = routing_map.get(category, "General IT Support")

    # ETA based on priority
    eta_map = {
        "P1": "1 hour",
        "P2": "4 hours",
        "P3": "1 business day",
        "P4": "3 business days",
    }

    ticket = {
        "ticket_id": ticket_number,
        "status": "created",
        "priority": priority,
        "category": category,
        "issue_summary": issue_summary,
        "attempted_steps": attempted_steps,
        "assigned_team": assigned_team,
        "affected_service": affected_service,
        "estimated_response": eta_map.get(priority, "1 business day"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": "IT Support Agent (Automated)",
        "message": (
            f"Ticket {ticket_number} has been created and assigned to "
            f"{assigned_team}. Expected first response: {eta_map.get(priority, '1 business day')}."
        ),
    }

    logger.info(f"Ticket created: {ticket_number} (P={priority}, Team={assigned_team})")
    return ticket


ESCALATION_TOOLS = [create_service_ticket]

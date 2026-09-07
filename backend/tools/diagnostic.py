"""
Diagnostic Tools — Read-Only.

These tools simulate checking the status of infrastructure
services, running network tests, and querying user entitlements.
All return mock data safe for development and demonstration.
"""

import random
import logging
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

from backend.tools.validators import (
    validate_service_name,
    validate_host_or_ip,
    validate_user_id,
    ValidationError,
)

logger = logging.getLogger(__name__)

# ── Mock Data ────────────────────────────────────────────────────────────────

_SERVICE_STATUS_MAP = {
    "vpn-gateway": {"display_name": "Cisco AnyConnect VPN Gateway", "typical_latency": 12},
    "sso-okta": {"display_name": "Okta SSO / Identity Provider", "typical_latency": 45},
    "exchange-online": {"display_name": "Microsoft Exchange Online", "typical_latency": 30},
    "smtp-relay": {"display_name": "SMTP Relay Server", "typical_latency": 8},
    "print-server": {"display_name": "Network Print Server", "typical_latency": 5},
    "file-server": {"display_name": "Corporate File Server", "typical_latency": 15},
    "dns-primary": {"display_name": "Primary DNS Server", "typical_latency": 2},
    "dns-secondary": {"display_name": "Secondary DNS Server", "typical_latency": 3},
    "ad-controller": {"display_name": "Active Directory Controller", "typical_latency": 10},
    "citrix-gateway": {"display_name": "Citrix Virtual Desktop Gateway", "typical_latency": 50},
}

_MOCK_OUTAGES = [
    {
        "id": "INC-2024-0892",
        "title": "Exchange Online — Intermittent Mail Delivery Delays",
        "affected_services": ["exchange-online", "smtp-relay"],
        "severity": "P2",
        "status": "Investigating",
        "started_at": "2024-03-15T14:30:00Z",
        "description": "Users may experience delays of 15-30 minutes in email delivery. Microsoft has acknowledged the issue and is investigating.",
        "symptoms": ["email delay", "outlook slow", "mail not sending", "email stuck"],
    },
]

_MOCK_USERS = {
    "default": {
        "user_id": "john.doe@corporate.com",
        "display_name": "John Doe",
        "department": "Engineering",
        "account_status": "active",
        "password_expired": False,
        "account_locked": False,
        "mfa_enrolled": True,
        "mfa_methods": ["Okta Verify Push", "SMS"],
        "groups": [
            "All-Employees",
            "Engineering-Team",
            "VPN-Users",
            "Software-Standard",
        ],
        "entitlements": [
            "Microsoft 365 E3",
            "Cisco AnyConnect VPN",
            "Jira",
            "Confluence",
            "GitHub Enterprise",
        ],
        "last_login": "2024-03-15T09:22:00Z",
        "device": "LAPTOP-ENG-4521",
        "os": "Windows 11 Enterprise 23H2",
    },
}


# ── Tool Functions ───────────────────────────────────────────────────────────

@tool
def check_service_status(service_name: str) -> dict[str, Any]:
    """
    Check the operational status of an internal service.

    Args:
        service_name: The service to check (e.g., 'vpn-gateway', 'sso-okta',
                      'exchange-online', 'print-server').

    Returns:
        Service status including uptime, latency, and health indicators.
    """
    try:
        service_name = validate_service_name(service_name)
    except ValidationError as e:
        return {"error": str(e), "status": "validation_failed"}

    service_info = _SERVICE_STATUS_MAP.get(service_name, {})
    display_name = service_info.get("display_name", service_name)
    base_latency = service_info.get("typical_latency", 20)

    # 85% chance service is UP
    is_up = random.random() < 0.85
    latency = base_latency + random.randint(-5, 25) if is_up else 0

    result = {
        "service_name": service_name,
        "display_name": display_name,
        "status": "operational" if is_up else "degraded",
        "is_healthy": is_up,
        "latency_ms": max(1, latency) if is_up else None,
        "uptime_percent": round(random.uniform(99.5, 99.99), 2) if is_up else round(random.uniform(85.0, 95.0), 2),
        "last_checked": datetime.now(timezone.utc).isoformat(),
        "message": (
            f"{display_name} is operating normally."
            if is_up
            else f"{display_name} is experiencing degraded performance."
        ),
    }

    logger.info(f"Service check: {service_name} → {result['status']}")
    return result


@tool
def run_network_test(host: str) -> dict[str, Any]:
    """
    Run a network connectivity test against a host.
    Tests reachability, DNS resolution, and latency.

    Args:
        host: Hostname or IP address to test (e.g., 'vpn.corporate.com', '8.8.8.8').

    Returns:
        Network test results including ping, DNS, and latency.
    """
    try:
        host = validate_host_or_ip(host)
    except ValidationError as e:
        return {"error": str(e), "status": "validation_failed"}

    # Mock results — 90% reachable
    is_reachable = random.random() < 0.90
    latency = random.randint(5, 120) if is_reachable else None
    dns_resolved = random.random() < 0.95 if not host.replace(".", "").isdigit() else True

    result = {
        "host": host,
        "reachable": is_reachable,
        "dns_resolved": dns_resolved,
        "resolved_ip": f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}" if dns_resolved and not host.replace(".", "").isdigit() else host,
        "latency_ms": latency,
        "packet_loss_percent": 0 if is_reachable else 100,
        "tested_at": datetime.now(timezone.utc).isoformat(),
        "message": (
            f"Host {host} is reachable (latency: {latency}ms)."
            if is_reachable
            else f"Host {host} is unreachable. Possible network or firewall issue."
        ),
    }

    if not dns_resolved:
        result["message"] = f"DNS resolution failed for {host}. Check DNS configuration."

    logger.info(f"Network test: {host} → reachable={is_reachable}")
    return result


@tool
def query_user_entitlements(user_id: str = "default") -> dict[str, Any]:
    """
    Query a user's Active Directory / IAM profile.
    Returns account status, group memberships, entitlements, and MFA enrollment.

    Args:
        user_id: The user's email or ID. Defaults to the current session user.

    Returns:
        User profile with account status, groups, and entitlements.
    """
    try:
        if user_id != "default":
            user_id = validate_user_id(user_id)
    except ValidationError as e:
        return {"error": str(e), "status": "validation_failed"}

    user_data = _MOCK_USERS.get(user_id, _MOCK_USERS["default"]).copy()
    user_data["queried_at"] = datetime.now(timezone.utc).isoformat()

    logger.info(f"User query: {user_id} → status={user_data['account_status']}")
    return user_data


@tool
def search_outage_board() -> dict[str, Any]:
    """
    Search the company outage board for ongoing incidents.
    Returns any active, acknowledged company-wide incidents.

    Returns:
        Active outages with their status, affected services, and details.
    """
    # 30% chance there's an active outage (for demo variety)
    if random.random() < 0.30:
        outage = random.choice(_MOCK_OUTAGES)
        return {
            "has_active_outage": True,
            "outages": [outage],
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "message": f"⚠️ Active incident: {outage['title']} (Status: {outage['status']})",
        }

    return {
        "has_active_outage": False,
        "outages": [],
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "message": "No active outages reported.",
    }


# ── Registry for agent use ──────────────────────────────────────────────────

DIAGNOSTIC_TOOLS = [
    check_service_status,
    run_network_test,
    query_user_entitlements,
    search_outage_board,
]

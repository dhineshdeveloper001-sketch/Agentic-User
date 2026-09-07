"""
Remediation Tools — Safe Actions (Mock).

These tools simulate executing remote remediation actions
like clearing DNS cache, flushing Kerberos tokens, or
restarting print spoolers. All actions are mock/simulated.
"""

import random
import logging
from datetime import datetime, timezone
from typing import Any

from langchain_core.tools import tool

from backend.tools.validators import (
    validate_action_type,
    ValidationError,
)
from backend.config import HITL_REQUIRED_ACTIONS

logger = logging.getLogger(__name__)

# Mock action descriptions and expected outcomes
_ACTION_DETAILS = {
    "clear_dns_cache": {
        "display_name": "Clear DNS Cache",
        "command": "ipconfig /flushdns",
        "description": "Flushes the local DNS resolver cache to clear stale entries.",
        "success_message": "DNS resolver cache successfully flushed.",
        "duration_seconds": 2,
    },
    "flush_kerberos_tokens": {
        "display_name": "Flush Kerberos Tokens",
        "command": "klist purge",
        "description": "Purges all Kerberos authentication tokens, forcing re-authentication.",
        "success_message": "All Kerberos tickets have been purged.",
        "duration_seconds": 3,
    },
    "restart_print_spooler": {
        "display_name": "Restart Print Spooler",
        "command": "net stop spooler && net start spooler",
        "description": "Stops and restarts the Windows Print Spooler service.",
        "success_message": "Print Spooler service restarted successfully.",
        "duration_seconds": 5,
    },
    "reset_network_adapter": {
        "display_name": "Reset Network Adapter",
        "command": "ipconfig /release && ipconfig /renew",
        "description": "Releases and renews the IP address and resets network adapter.",
        "success_message": "Network adapter reset. New IP address obtained.",
        "duration_seconds": 8,
    },
    "clear_browser_cache": {
        "display_name": "Clear Browser Cache",
        "command": "RunDll32.exe InetCpl.cpl,ClearMyTracksByProcess 8",
        "description": "Clears the browser cache and temporary internet files.",
        "success_message": "Browser cache cleared successfully.",
        "duration_seconds": 4,
    },
}


@tool
def trigger_remote_action(action_type: str, endpoint_id: str = "local") -> dict[str, Any]:
    """
    Execute a safe remediation action on a device.
    Actions include clearing DNS cache, flushing Kerberos tokens,
    restarting the print spooler, or resetting the network adapter.

    Args:
        action_type: The action to perform. Must be one of:
                     'clear_dns_cache', 'flush_kerberos_tokens',
                     'restart_print_spooler', 'reset_network_adapter',
                     'clear_browser_cache'.
        endpoint_id: The target device identifier. Defaults to 'local'.

    Returns:
        Action result including success/failure status and details.
    """
    try:
        action_type = validate_action_type(action_type)
    except ValidationError as e:
        return {"error": str(e), "status": "validation_failed"}

    # Check if this action requires HITL
    if action_type in HITL_REQUIRED_ACTIONS:
        return {
            "action": action_type,
            "status": "requires_approval",
            "message": (
                f"Action '{action_type}' is security-sensitive and "
                "requires explicit user approval before execution."
            ),
            "requires_hitl": True,
        }

    action_info = _ACTION_DETAILS.get(action_type, {})
    display_name = action_info.get("display_name", action_type)

    # 92% success rate for mock actions
    success = random.random() < 0.92

    result = {
        "action": action_type,
        "display_name": display_name,
        "endpoint_id": endpoint_id,
        "status": "success" if success else "failed",
        "command_executed": action_info.get("command", "N/A"),
        "duration_seconds": action_info.get("duration_seconds", 5),
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "message": (
            action_info.get("success_message", f"{display_name} completed.")
            if success
            else f"{display_name} failed. The service may be unresponsive."
        ),
    }

    logger.info(f"Remote action: {action_type} on {endpoint_id} → {result['status']}")
    return result


REMEDIATION_TOOLS = [trigger_remote_action]

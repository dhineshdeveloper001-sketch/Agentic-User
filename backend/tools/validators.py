"""
Input Validation & Whitelisting for Tool Parameters.

Never pass raw user strings into shell commands or network utilities.
Uses strict regex checks and parameter whitelists.
"""

import re
import logging
from backend.config import ALLOWED_SERVICES, ALLOWED_ACTIONS, ALLOWED_IP_RANGES

logger = logging.getLogger(__name__)

# Regex patterns
_HOSTNAME_PATTERN = re.compile(
    r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?"
    r"(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$"
)
_IP_PATTERNS = [re.compile(p) for p in ALLOWED_IP_RANGES]
_MAX_INPUT_LENGTH = 256
_DANGEROUS_CHARS = re.compile(r"[;&|`$(){}!<>\"\'\\\n\r]")


class ValidationError(Exception):
    """Raised when input validation fails."""
    pass


def sanitize_string(value: str, field_name: str = "input") -> str:
    """Strip dangerous characters and enforce length limits."""
    if not isinstance(value, str):
        raise ValidationError(f"{field_name} must be a string.")
    value = value.strip()
    if len(value) > _MAX_INPUT_LENGTH:
        raise ValidationError(
            f"{field_name} exceeds maximum length of {_MAX_INPUT_LENGTH}."
        )
    if _DANGEROUS_CHARS.search(value):
        raise ValidationError(
            f"{field_name} contains disallowed characters."
        )
    return value


def validate_service_name(service_name: str) -> str:
    """Validate service name against whitelist."""
    service_name = sanitize_string(service_name, "service_name").lower()
    if service_name not in ALLOWED_SERVICES:
        raise ValidationError(
            f"Service '{service_name}' is not in the allowed list. "
            f"Allowed: {', '.join(ALLOWED_SERVICES)}"
        )
    return service_name


def validate_action_type(action_type: str) -> str:
    """Validate action type against whitelist."""
    action_type = sanitize_string(action_type, "action_type").lower()
    if action_type not in ALLOWED_ACTIONS:
        raise ValidationError(
            f"Action '{action_type}' is not in the allowed list. "
            f"Allowed: {', '.join(ALLOWED_ACTIONS)}"
        )
    return action_type


def validate_host_or_ip(host: str) -> str:
    """Validate that input is a valid hostname or an allowed IP address."""
    host = sanitize_string(host, "host").lower()

    # Check if it's an IP address matching allowed ranges
    for pattern in _IP_PATTERNS:
        if pattern.match(host):
            return host

    # Check if it's a valid hostname
    if _HOSTNAME_PATTERN.match(host):
        return host

    # Allow well-known public DNS for testing
    if host in ("8.8.8.8", "8.8.4.4", "1.1.1.1"):
        return host

    raise ValidationError(
        f"Host '{host}' is not a valid hostname or allowed IP address."
    )


def validate_user_id(user_id: str) -> str:
    """Validate user ID format (alphanumeric + dots/hyphens/underscores)."""
    user_id = sanitize_string(user_id, "user_id")
    if not re.match(r"^[a-zA-Z0-9._\-@]{1,128}$", user_id):
        raise ValidationError(
            f"User ID '{user_id}' contains invalid characters."
        )
    return user_id


def validate_priority(priority: str) -> str:
    """Validate priority level."""
    priority = sanitize_string(priority, "priority").upper()
    allowed = {"P1", "P2", "P3", "P4"}
    if priority not in allowed:
        raise ValidationError(
            f"Priority '{priority}' is invalid. Allowed: {', '.join(allowed)}"
        )
    return priority


def validate_text_field(text: str, field_name: str, max_length: int = 2000) -> str:
    """Validate a free-text field with extended length (for descriptions)."""
    if not isinstance(text, str):
        raise ValidationError(f"{field_name} must be a string.")
    text = text.strip()
    if len(text) > max_length:
        raise ValidationError(
            f"{field_name} exceeds maximum length of {max_length}."
        )
    return text

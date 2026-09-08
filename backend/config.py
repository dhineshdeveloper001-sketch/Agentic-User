"""
Central configuration for the IT Support Agent backend.
Loads settings from environment variables with sensible defaults.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from backend or root project directory (root takes precedence)
_backend_dir = Path(__file__).parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env", override=True)


# ── OpenAI / LLM Configuration ───────────────────────────────────────────────
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_TEMPERATURE: float = float(os.getenv("OPENAI_TEMPERATURE", "0.2"))

# Auto-configure Zhipu AI / GLM endpoint if Zhipu key format is detected and no base_url specified
if OPENAI_API_KEY and "." in OPENAI_API_KEY and len(OPENAI_API_KEY.split(".")[0]) >= 16 and not OPENAI_BASE_URL:
    OPENAI_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/"
    if OPENAI_MODEL == "gpt-4o-mini":
        OPENAI_MODEL = "glm-4-flash"

# ── RAG Pipeline ─────────────────────────────────────────────────────────────
CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.3"))
RAG_TOP_K: int = int(os.getenv("RAG_TOP_K", "10"))
RERANKER_TOP_N: int = int(os.getenv("RERANKER_TOP_N", "3"))
EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# ── ChromaDB ─────────────────────────────────────────────────────────────────
# On Vercel serverless or AWS Lambda, only /tmp is writable
_is_serverless = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME") or os.getenv("LAMBDA_TASK_ROOT"))
if _is_serverless:
    _default_chroma_dir = "/tmp/chromadb"
else:
    _default_chroma_dir = str(_backend_dir / "data" / "chromadb")

_env_chroma_dir = os.getenv("CHROMA_PERSIST_DIR", "")
if _is_serverless or not _env_chroma_dir:
    CHROMA_PERSIST_DIR = "/tmp/chromadb" if _is_serverless else _default_chroma_dir
else:
    CHROMA_PERSIST_DIR = _env_chroma_dir

# ── Server ───────────────────────────────────────────────────────────────────
BACKEND_HOST: str = os.getenv("BACKEND_HOST", "0.0.0.0")
BACKEND_PORT: int = int(os.getenv("PORT", os.getenv("BACKEND_PORT", "8000")))
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

# ── Tool Whitelists (Phase 4 Guardrails) ─────────────────────────────────────
ALLOWED_SERVICES: list[str] = [
    "vpn-gateway",
    "sso-okta",
    "exchange-online",
    "smtp-relay",
    "print-server",
    "file-server",
    "dns-primary",
    "dns-secondary",
    "ad-controller",
    "citrix-gateway",
]

ALLOWED_ACTIONS: list[str] = [
    "clear_dns_cache",
    "flush_kerberos_tokens",
    "restart_print_spooler",
    "reset_network_adapter",
    "clear_browser_cache",
]

ALLOWED_IP_RANGES: list[str] = [
    r"^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$",        # 10.x.x.x internal
    r"^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$",  # 172.16-31.x.x
    r"^192\.168\.\d{1,3}\.\d{1,3}$",             # 192.168.x.x
]

# ── Destructive Actions Requiring HITL ────────────────────────────────────────
HITL_REQUIRED_ACTIONS: list[str] = [
    "password_reset",
    "account_suspension",
    "remote_reboot",
    "group_membership_change",
    "mfa_reset",
]

# ── SOP Data Directory ───────────────────────────────────────────────────────
_default_sop_dir = _backend_dir / "knowledge_base" / "sample_sops"
if not _default_sop_dir.exists():
    _cwd_sop_dir = Path.cwd() / "backend" / "knowledge_base" / "sample_sops"
    if _cwd_sop_dir.exists():
        _default_sop_dir = _cwd_sop_dir

SOP_DIR: str = os.getenv("SOP_DIR", str(_default_sop_dir))


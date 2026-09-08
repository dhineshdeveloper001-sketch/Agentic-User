"""
SOP Document Ingestion Pipeline.

Loads structured SOP JSON files, chunks them by logical section
(not arbitrary token counts), and indexes them into ChromaDB
with metadata for hybrid search.
"""

import json
import os
import logging
from pathlib import Path
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings

from backend.config import SOP_DIR, CHROMA_PERSIST_DIR

logger = logging.getLogger(__name__)


def load_sops(sop_dir: str | None = None) -> list[dict[str, Any]]:
    """Load all SOP JSON files from the data directory."""
    sop_dir = sop_dir or SOP_DIR
    sops = []
    sop_path = Path(sop_dir)
    if not sop_path.exists():
        logger.warning(f"SOP directory not found: {sop_dir}")
        return sops

    for fpath in sorted(sop_path.glob("*.json")):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                sop = json.load(f)
                sops.append(sop)
                logger.info(f"Loaded SOP: {sop.get('id', fpath.name)}")
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"Failed to load {fpath}: {e}")
    return sops


def chunk_sop(sop: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Chunk a single SOP into logical sections for indexing.

    Each chunk is self-contained and includes enough context
    to be useful on its own. We chunk by:
      1. Overview (title, symptoms, error codes) — one chunk
      2. Each resolution step — one chunk per step
      3. Escalation criteria — one chunk

    This avoids cutting off multi-step recovery instructions.
    """
    sop_id = sop["id"]
    title = sop["title"]
    category = sop.get("category", "General")
    platforms = sop.get("platforms", [])
    tags = sop.get("tags", [])

    base_metadata = {
        "sop_id": sop_id,
        "title": title,
        "category": category,
        "platforms": ", ".join(platforms),
        "tags": ", ".join(tags),
    }

    chunks = []

    # ── Chunk 1: Overview (symptoms + error codes + diagnostic questions) ──
    symptoms_text = "\n".join(f"- {s}" for s in sop.get("symptoms", []))
    error_codes_text = "\n".join(f"- {e}" for e in sop.get("error_codes", []))
    diag_questions = "\n".join(
        f"- {q}" for q in sop.get("diagnostic_questions", [])
    )
    prerequisites = "\n".join(
        f"- {p}" for p in sop.get("prerequisites", [])
    )

    overview_text = (
        f"# {title}\n\n"
        f"**Category:** {category}\n"
        f"**Platforms:** {', '.join(platforms)}\n\n"
        f"## Symptoms\n{symptoms_text}\n\n"
        f"## Error Codes\n{error_codes_text}\n\n"
        f"## Prerequisites\n{prerequisites}\n\n"
        f"## Diagnostic Questions\n{diag_questions}"
    )
    chunks.append({
        "id": f"{sop_id}_overview",
        "text": overview_text,
        "metadata": {**base_metadata, "chunk_type": "overview"},
    })

    # ── Chunk 2+: Each resolution step ───────────────────────────────────
    for step_data in sop.get("resolution_steps", []):
        step_num = step_data["step"]
        step_text = (
            f"# {title} — Step {step_num}\n\n"
            f"**Action:** {step_data['action']}\n\n"
            f"**Checkpoint:** {step_data.get('checkpoint', 'N/A')}\n"
        )
        if step_data.get("branch_on_fail"):
            step_text += (
                f"**If this fails:** Go to {step_data['branch_on_fail']}\n"
            )
        if step_data.get("auto_tool"):
            tool = step_data["auto_tool"]
            step_text += (
                f"**Automated tool:** {tool['tool']}({tool['args']})\n"
            )
        if step_data.get("requires_hitl"):
            step_text += "**⚠️ Requires human approval before executing.**\n"

        chunks.append({
            "id": f"{sop_id}_step_{step_num}",
            "text": step_text,
            "metadata": {
                **base_metadata,
                "chunk_type": "resolution_step",
                "step_number": step_num,
            },
        })

    # ── Chunk 3: Escalation criteria ─────────────────────────────────────
    escalation_text = (
        f"# {title} — Escalation\n\n"
        f"**Criteria:** {sop.get('escalation_criteria', 'N/A')}\n"
        f"**Priority:** {sop.get('escalation_priority', 'P3')}\n"
        f"**Team:** {sop.get('escalation_team', 'General Support')}\n"
    )
    chunks.append({
        "id": f"{sop_id}_escalation",
        "text": escalation_text,
        "metadata": {
            **base_metadata,
            "chunk_type": "escalation",
            "priority": sop.get("escalation_priority", "P3"),
            "team": sop.get("escalation_team", "General Support"),
        },
    })

    return chunks


def build_index(
    force_rebuild: bool = False,
) -> chromadb.Collection:
    """
    Load all SOPs, chunk them, and index into ChromaDB.
    Returns the ChromaDB collection ready for queries.

    If the collection already exists and force_rebuild is False,
    returns the existing collection.
    """
    persist_dir = Path(CHROMA_PERSIST_DIR)
    persist_dir.mkdir(parents=True, exist_ok=True)

    client = chromadb.PersistentClient(path=str(persist_dir))

    collection_name = "it_support_sops"

    # Check if collection already exists
    existing = [c.name for c in client.list_collections()]
    if collection_name in existing and not force_rebuild:
        logger.info("Using existing ChromaDB collection.")
        return client.get_collection(name=collection_name)

    # Delete and rebuild
    if collection_name in existing:
        client.delete_collection(name=collection_name)
        logger.info("Deleted existing collection for rebuild.")

    collection = client.create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )

    # Load and chunk all SOPs
    sops = load_sops()
    if not sops:
        logger.warning("No SOPs found — collection will be empty.")
        return collection

    all_chunks = []
    for sop in sops:
        all_chunks.extend(chunk_sop(sop))

    logger.info(f"Indexing {len(all_chunks)} chunks from {len(sops)} SOPs...")

    # Batch add to ChromaDB
    # ChromaDB generates embeddings automatically using its default model
    ids = [c["id"] for c in all_chunks]
    documents = [c["text"] for c in all_chunks]
    metadatas = []
    for c in all_chunks:
        # ChromaDB metadata values must be str, int, float, or bool
        meta = {}
        for k, v in c["metadata"].items():
            if isinstance(v, (str, int, float, bool)):
                meta[k] = v
            else:
                meta[k] = str(v)
        metadatas.append(meta)

    collection.add(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
    )

    logger.info(
        f"Successfully indexed {collection.count()} chunks into ChromaDB."
    )
    try:
        from backend.knowledge_base.retriever import reset_retriever
        reset_retriever()
    except Exception:
        pass
    return collection


def get_raw_sops() -> list[dict[str, Any]]:
    """Load and return all raw SOP data (for tool use, not retrieval)."""
    return load_sops()

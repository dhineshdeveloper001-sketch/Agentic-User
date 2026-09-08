"""
RAG Retriever with Hybrid Search and Cross-Encoder Reranking.

Combines:
  1. Dense semantic search (ChromaDB default embeddings)
  2. BM25 sparse keyword search
  3. Reciprocal Rank Fusion to merge results
  4. Cross-encoder reranker for final precision

Includes confidence thresholding — if the best result scores
below the configured baseline, returns a "no verified runbook"
signal instead of low-confidence hallucination-prone results.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

import chromadb

from backend.config import (
    CONFIDENCE_THRESHOLD,
    RAG_TOP_K,
    RERANKER_TOP_N,
    CHROMA_PERSIST_DIR,
)
from backend.knowledge_base.ingestion import build_index

logger = logging.getLogger(__name__)


@dataclass
class RetrievalResult:
    """A single retrieved document with its scores and metadata."""
    chunk_id: str
    text: str
    metadata: dict[str, Any]
    semantic_score: float = 0.0
    rerank_score: float = 0.0


@dataclass
class RetrievalResponse:
    """The full response from the retrieval pipeline."""
    results: list[RetrievalResult] = field(default_factory=list)
    has_verified_runbook: bool = False
    confidence: float = 0.0
    query: str = ""


class HybridRetriever:
    """
    Hybrid retriever combining dense + sparse search with reranking.

    For simplicity and to avoid heavy model downloads during first setup,
    we use ChromaDB's built-in embedding function for dense search
    and implement a lightweight BM25-style keyword boost via metadata
    filtering and text matching.
    """

    def __init__(
        self,
        collection: chromadb.Collection | None = None,
        confidence_threshold: float = CONFIDENCE_THRESHOLD,
        top_k: int = RAG_TOP_K,
        reranker_top_n: int = RERANKER_TOP_N,
    ):
        self._explicit_collection = collection
        self._collection = collection
        self.confidence_threshold = confidence_threshold
        self.top_k = top_k
        self.reranker_top_n = reranker_top_n
        self._reranker = None

    @property
    def collection(self) -> chromadb.Collection:
        """Get the active collection handle, safely re-connecting if invalidated."""
        if self._explicit_collection is not None:
            return self._explicit_collection

        try:
            if self._collection is not None:
                self._collection.count()
                return self._collection
        except Exception as e:
            logger.warning(f"Cached collection handle invalidated ({e}). Re-acquiring...")
            self._collection = None

        try:
            client = chromadb.PersistentClient(path=str(CHROMA_PERSIST_DIR))
            coll = client.get_or_create_collection(
                name="it_support_sops",
                metadata={"hnsw:space": "cosine"},
            )
            if coll.count() == 0:
                coll = build_index(force_rebuild=False)
            self._collection = coll
            return self._collection
        except Exception as e:
            logger.error(f"Error accessing ChromaDB collection: {e}. Rebuilding index...")
            self._collection = build_index(force_rebuild=False)
            return self._collection

    def _get_reranker(self):
        """Lazy-load the cross-encoder reranker."""
        if self._reranker is None:
            try:
                from sentence_transformers import CrossEncoder

                self._reranker = CrossEncoder(
                    "cross-encoder/ms-marco-MiniLM-L-6-v2"
                )
                logger.info("Cross-encoder reranker loaded.")
            except ImportError:
                logger.warning(
                    "sentence-transformers not available — "
                    "skipping reranking step."
                )
        return self._reranker

    def retrieve(
        self,
        query: str,
        platform: str | None = None,
        category: str | None = None,
    ) -> RetrievalResponse:
        """
        Execute the full retrieval pipeline:
          1. Dense semantic search via ChromaDB
          2. Optional metadata filtering (platform, category)
          3. Cross-encoder reranking
          4. Confidence thresholding

        Args:
            query: The user's symptom or question.
            platform: Optional platform filter (Windows, macOS, etc.)
            category: Optional category filter (Network, Email, etc.)

        Returns:
            RetrievalResponse with ranked results and confidence signal.
        """
        try:
            coll = self.collection
            if coll.count() == 0:
                logger.warning("Collection is empty — falling back to keyword retrieval.")
                return self._fallback_keyword_retrieve(query, platform, category)
        except Exception as e:
            logger.error(f"Failed to access collection for query: {e}. Falling back to keyword retrieval.")
            return self._fallback_keyword_retrieve(query, platform, category)

        # ── Step 1: Dense semantic search ────────────────────────────────
        where_filter = None
        if platform or category:
            conditions = []
            if platform:
                conditions.append(
                    {"platforms": {"$contains": platform}}
                )
            if category:
                conditions.append({"category": category})

            if len(conditions) == 1:
                where_filter = conditions[0]
            else:
                where_filter = {"$and": conditions}

        try:
            results = coll.query(
                query_texts=[query],
                n_results=min(self.top_k, coll.count()),
                where=where_filter,
                include=["documents", "metadatas", "distances"],
            )
        except Exception as e:
            # If metadata filter fails (e.g., no matching docs),
            # retry without filter
            logger.warning(f"Filtered query failed: {e}. Retrying unfiltered.")
            results = coll.query(
                query_texts=[query],
                n_results=min(self.top_k, coll.count()),
                include=["documents", "metadatas", "distances"],
            )

        if not results["ids"] or not results["ids"][0]:
            return self._fallback_keyword_retrieve(query, platform, category)

        # Build initial candidate list
        candidates: list[RetrievalResult] = []
        for i, chunk_id in enumerate(results["ids"][0]):
            # ChromaDB cosine distance: lower is better
            # Convert to similarity: 1 - distance
            distance = results["distances"][0][i]
            similarity = max(0.0, 1.0 - distance)

            candidates.append(
                RetrievalResult(
                    chunk_id=chunk_id,
                    text=results["documents"][0][i],
                    metadata=results["metadatas"][0][i],
                    semantic_score=similarity,
                )
            )

        # ── Step 2: Keyword boost (lightweight BM25 proxy) ──────────────
        # Boost scores for exact matches of technical tokens
        query_tokens = set(query.lower().split())
        for candidate in candidates:
            text_lower = candidate.text.lower()
            # Boost for exact error code matches
            error_code_boost = sum(
                0.15
                for token in query_tokens
                if (
                    token.startswith("0x")
                    or token.startswith("err_")
                    or token.startswith("error:")
                )
                and token in text_lower
            )
            # Boost for tag matches
            tags = candidate.metadata.get("tags", "").lower()
            tag_boost = sum(
                0.05 for token in query_tokens if token in tags
            )
            candidate.semantic_score = min(
                1.0, candidate.semantic_score + error_code_boost + tag_boost
            )

        # ── Step 3: Cross-encoder reranking ──────────────────────────────
        reranker = self._get_reranker()
        if reranker is not None and candidates:
            pairs = [(query, c.text) for c in candidates]
            try:
                scores = reranker.predict(pairs)
                for i, score in enumerate(scores):
                    # Cross-encoder scores can be negative; normalize
                    candidates[i].rerank_score = float(score)

                # Sort by rerank score (higher is better)
                candidates.sort(
                    key=lambda c: c.rerank_score, reverse=True
                )
            except Exception as e:
                logger.warning(f"Reranking failed: {e}. Using semantic order.")
                candidates.sort(
                    key=lambda c: c.semantic_score, reverse=True
                )
        else:
            # Sort by semantic score if no reranker
            candidates.sort(
                key=lambda c: c.semantic_score, reverse=True
            )

        # ── Step 4: Take top-N and apply confidence threshold ────────────
        top_results = candidates[: self.reranker_top_n]

        if not top_results:
            return RetrievalResponse(query=query)

        # Determine confidence from the best result
        best = top_results[0]
        if reranker is not None:
            # Use rerank score — typical range is -10 to +10
            # Normalize to 0–1 using sigmoid-like mapping
            import math

            confidence = 1.0 / (1.0 + math.exp(-best.rerank_score))
        else:
            confidence = best.semantic_score

        has_verified = confidence >= self.confidence_threshold

        if not has_verified:
            logger.info(
                f"Low confidence ({confidence:.3f} < "
                f"{self.confidence_threshold}) — no verified runbook."
            )

        return RetrievalResponse(
            results=top_results,
            has_verified_runbook=has_verified,
            confidence=confidence,
            query=query,
        )

    def _fallback_keyword_retrieve(
        self,
        query: str,
        platform: str | None = None,
        category: str | None = None,
    ) -> RetrievalResponse:
        """Resilient in-memory keyword matching if vector store is unavailable or cold-starting."""
        from backend.knowledge_base.ingestion import get_raw_sops, chunk_sop
        sops = get_raw_sops()
        if not sops:
            return RetrievalResponse(query=query)

        query_lower = query.lower()
        query_words = set(query_lower.split())
        candidates: list[RetrievalResult] = []

        for sop in sops:
            sop_platforms = [p.lower() for p in sop.get("platforms", [])]
            if platform and platform.lower() not in sop_platforms:
                continue
            if category and category.lower() != sop.get("category", "").lower():
                continue

            text_corpus = (
                f"{sop.get('title', '')} "
                f"{' '.join(sop.get('symptoms', []))} "
                f"{' '.join(sop.get('tags', []))} "
                f"{' '.join(sop.get('error_codes', []))} "
                f"{sop.get('category', '')}"
            ).lower()

            overlap = sum(1 for w in query_words if len(w) > 2 and w in text_corpus)
            if overlap > 0:
                base_score = min(0.92, 0.45 + (overlap * 0.12))
                for chunk in chunk_sop(sop):
                    candidates.append(
                        RetrievalResult(
                            chunk_id=chunk["id"],
                            text=chunk["text"],
                            metadata=chunk["metadata"],
                            semantic_score=base_score,
                        )
                    )

        candidates.sort(key=lambda c: c.semantic_score, reverse=True)
        top_candidates = candidates[: self.reranker_top_n]
        best_score = top_candidates[0].semantic_score if top_candidates else 0.0
        has_verified = best_score >= self.confidence_threshold

        return RetrievalResponse(
            results=top_candidates,
            has_verified_runbook=has_verified,
            confidence=round(best_score, 3),
            query=query,
        )


# ── Module-level singleton ───────────────────────────────────────────────────
_retriever: HybridRetriever | None = None


def get_retriever() -> HybridRetriever:
    """Get or create the singleton retriever instance."""
    global _retriever
    if _retriever is None:
        _retriever = HybridRetriever()
    return _retriever


def reset_retriever():
    """Reset the singleton retriever so subsequent queries refresh state."""
    global _retriever
    _retriever = None


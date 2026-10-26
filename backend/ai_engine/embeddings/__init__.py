"""
embeddings/ — sentence-transformer embedding generation.

Delegates to apps.recommendations.services.semantic_matching which owns
the model loader (@lru_cache), text-builder utilities, and dimension
validation (EMBEDDING_DIMENSION = 384).

When called outside Django (e.g. a plain script or notebook), this module
can also be used directly by loading the model here — Django setup is only
required when the persist_* helpers are called.
"""

from __future__ import annotations
from typing import Optional

EMBEDDING_DIMENSION = 384


def generate_text_embedding(text: str) -> list[float]:
    """
    Convert arbitrary text into a 384-dim embedding vector.
    Loads the SentenceTransformer model on first call (cached).

    Delegates to the existing Django service so the model is only
    loaded once across the entire process.
    """
    if not text or not text.strip():
        return []

    try:
        # Prefer the cached loader already used by the Django services
        from apps.recommendations.services.semantic_matching import (
            generate_embedding,
        )
        return generate_embedding(text)
    except ImportError:
        # Fallback: load model directly (no Django required)
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("all-MiniLM-L6-v2")
        return model.encode(text, normalize_embeddings=True).tolist()


def build_student_text(student) -> str:
    """Build a text representation of a student profile for embedding."""
    try:
        from apps.recommendations.services.semantic_matching import (
            build_student_text as _build,
        )
        return _build(student)
    except ImportError:
        return ""


def build_internship_text(internship) -> str:
    """Build a text representation of an internship for embedding."""
    try:
        from apps.recommendations.services.semantic_matching import (
            build_internship_text as _build,
        )
        return _build(internship)
    except ImportError:
        return ""


def cosine_similarity_score(
    vec_a: list[float],
    vec_b: list[float],
) -> float:
    """
    Cosine similarity between two vectors, scaled to 0–100.
    Returns 0.0 if either vector is empty.
    """
    if not vec_a or not vec_b:
        return 0.0

    try:
        from apps.recommendations.services.semantic_matching import (
            calculate_semantic_similarity,
        )
        return calculate_semantic_similarity(vec_a, vec_b)
    except ImportError:
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np
        sim = cosine_similarity([vec_a], [vec_b])[0][0]
        return round(float(max(0.0, min(100.0, sim * 100))), 2)

"""
semantic_matching/ — cosine similarity over sentence-transformer embeddings.

Handles the case where skills/descriptions use different words for the
same concept (e.g. "frontend development" vs "React developer").
Embedding dimension: 384  (all-MiniLM-L6-v2 via sentence-transformers).

Delegates to apps.recommendations.services.semantic_matching.
"""

from __future__ import annotations
from typing import Optional


def similarity_score(
    vec_a: list[float],
    vec_b: list[float],
) -> float:
    """
    Cosine similarity between two 384-dim vectors, scaled to 0–100.
    Returns 0.0 if either vector is missing or empty.
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
        sim = cosine_similarity([vec_a], [vec_b])[0][0]
        return round(float(max(0.0, min(100.0, sim * 100))), 2)


def embed_text(text: str) -> list[float]:
    """Generate a 384-dim embedding for arbitrary text."""
    from ai_engine.embeddings import generate_text_embedding
    return generate_text_embedding(text)


def student_internship_similarity(
    student_embedding: Optional[list[float]],
    internship_embedding: Optional[list[float]],
) -> float:
    """
    Convenience wrapper — compute similarity between pre-computed embeddings.
    Returns 0.0 if either embedding is None or empty.
    """
    if not student_embedding or not internship_embedding:
        return 0.0
    return similarity_score(student_embedding, internship_embedding)

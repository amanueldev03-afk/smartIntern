"""
Thread-safe singleton model loader for SentenceTransformer.
Loads 'all-MiniLM-L6-v2' to produce dense 384-dimensional vector embeddings.
"""

from __future__ import annotations

import re
import threading
from typing import Optional
from sentence_transformers import SentenceTransformer

DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIMENSION = 384


class EmbeddingModelLoader:
    """
    Thread-safe singleton wrapper for SentenceTransformer model loading.
    """

    _instance: Optional[EmbeddingModelLoader] = None
    _lock: threading.Lock = threading.Lock()

    def __new__(cls, model_name: str = DEFAULT_MODEL_NAME) -> EmbeddingModelLoader:
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    instance = super().__new__(cls)
                    instance.model_name = model_name
                    instance._model = None
                    instance._load_lock = threading.Lock()
                    cls._instance = instance
        return cls._instance

    @property
    def model(self) -> SentenceTransformer:
        """
        Lazily load the SentenceTransformer model on first access in a thread-safe manner.
        """
        if self._model is None:
            with self._load_lock:
                if self._model is None:
                    self._model = SentenceTransformer(self.model_name)
        return self._model


_loader = EmbeddingModelLoader()


def get_model() -> SentenceTransformer:
    """
    Return the singleton SentenceTransformer model instance.
    """
    return _loader.model


def normalize_text(text: str) -> str:
    """
    Normalize text for embedding generation:
    - Lowercase
    - Replace tabs and newlines with spaces
    - Remove disruptive punctuation while preserving alphanumeric tokens and key symbols (+, #, -, .)
    - Collapse extra whitespace
    """
    if not text:
        return ""
    
    text = text.lower()
    text = re.sub(r"[\r\n\t]+", " ", text)
    # Remove characters other than letters, numbers, whitespace, and common tech symbols
    text = re.sub(r"[^\w\s\+\#\.\-]", " ", text)
    # Normalize multiple whitespace into single space
    text = re.sub(r"\s+", " ", text).strip()
    return text


def get_embedding(text: str) -> list[float]:
    """
    Normalize input text and return a 384-element float list embedding.
    Uses unit length normalization (normalize_embeddings=True) for cosine distance compatibility.
    """
    normalized = normalize_text(text)
    if not normalized:
        # Return a zero vector of appropriate dimensionality for empty inputs
        return [0.0] * EMBEDDING_DIMENSION

    model = get_model()
    embedding = model.encode(normalized, normalize_embeddings=True)
    
    vector = [float(val) for val in embedding.tolist()]
    if len(vector) != EMBEDDING_DIMENSION:
        raise ValueError(
            f"Expected embedding dimension {EMBEDDING_DIMENSION}, got {len(vector)}"
        )
    return vector

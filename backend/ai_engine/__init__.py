"""
ai_engine — standalone AI package for the AI Internship Platform.

This package is NOT a Django app. It contains pure Python modules that
implement (or delegate to) the core AI logic:

  resume_parser/     — CV text extraction + structured data parsing (spaCy + OpenAI)
  embeddings/        — sentence-transformer embedding generation and storage
  skill_matching/    — exact + fuzzy skill intersection scoring
  semantic_matching/ — cosine similarity over sentence embeddings
  ranking/           — weighted score aggregation and sorting
  models/            — plain dataclasses (no Django ORM) shared across modules
  recommendation.py  — top-level orchestrator: profile + pool → ranked results
  explanation.py     — human-readable match explanation generator

The Django apps (apps.recommendations, apps.internships, etc.) call into
this package for all AI operations. The package itself never imports Django
models directly — it works with plain Python dataclasses defined in models/.
This separation means ai_engine can be:
  - unit-tested without a running Django/DB stack
  - called from Celery workers, management commands, or notebooks
  - extracted into a microservice later with minimal refactoring
"""

__version__ = "0.1.0"

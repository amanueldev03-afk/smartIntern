-- Run once on first container startup (as superuser).
-- Installs pgvector so Django migrations can use vector fields.
CREATE EXTENSION IF NOT EXISTS vector;

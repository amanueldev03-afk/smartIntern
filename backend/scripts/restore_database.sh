#!/usr/bin/env bash
# =============================================================================
# PostgreSQL Disaster Recovery / Database Restore Script
# Usage: ./scripts/restore_database.sh --backup-key <key> --target-db ai_internship_recovery
# =============================================================================

set -euo pipefail

echo "================================================================="
echo " [RESTORE] Executing PostgreSQL Database Recovery"
echo "================================================================="

cd "$(dirname "$0")/.."

python manage.py restore_database "$@"

echo "================================================================="
echo " [RESTORE] Recovery Completed Successfully."
echo "================================================================="

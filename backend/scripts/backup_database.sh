#!/usr/bin/env bash
# =============================================================================
# Automated / Manual PostgreSQL Backup Script for AI Internship Platform
# Usage: ./scripts/backup_database.sh [--no-upload] [--retention-days 30]
# =============================================================================

set -euo pipefail

echo "================================================================="
echo " [BACKUP] Executing PostgreSQL Database Backup"
echo "================================================================="

cd "$(dirname "$0")/.."

python manage.py backup_database "$@"

echo "================================================================="
echo " [BACKUP] Done."
echo "================================================================="

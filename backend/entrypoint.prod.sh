#!/bin/sh
set -e

echo "==> [SmartIntern-ET Entrypoint] Starting Node.js & Express Backend..."
echo "==> Environment: NODE_ENV=${NODE_ENV:-production}, PORT=${PORT:-8000}"

# Ensure media storage directories exist
mkdir -p media/student_cvs media/srs_docs media/profile_photos

exec "$@"

"""
Tests running full migration history from scratch on an empty PostgreSQL database.

Definition of Done (Phase 1):
Full migration history runs cleanly from scratch (migrate on an empty DB, no manual fixups).
"""
import os
import sys
import subprocess
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

DB_USER = "ai_user"
DB_PASS = "ai_password"
DB_HOST = "localhost"
DB_PORT = "5432"
SUPER_USER = "postgres"
SUPER_PASS = "postgres"
SCRATCH_DB = "ai_internship_scratch_test"

def test_fresh_migration():
    print("=" * 70)
    print("PHASE 1 DEFINITION OF DONE: CLEAN DB MIGRATION TEST")
    print("=" * 70)

    # 1. Connect to postgres superuser
    print(f"[1/5] Connecting to PostgreSQL superuser at {DB_HOST}:{DB_PORT}...")
    conn = psycopg2.connect(
        dbname="postgres",
        user=SUPER_USER,
        password=SUPER_PASS,
        host=DB_HOST,
        port=DB_PORT,
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()

    print(f"[2/5] Creating completely empty scratch database '{SCRATCH_DB}'...")
    cursor.execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB};")
    cursor.execute(f"CREATE DATABASE {SCRATCH_DB} OWNER {DB_USER};")
    cursor.close()
    conn.close()

    # 3. Enable vector extension on the fresh DB as superuser and grant permissions
    print(f"[3/5] Enabling pgvector extension on '{SCRATCH_DB}'...")
    scratch_conn = psycopg2.connect(
        dbname=SCRATCH_DB,
        user=SUPER_USER,
        password=SUPER_PASS,
        host=DB_HOST,
        port=DB_PORT,
    )
    scratch_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    scratch_cursor = scratch_conn.cursor()
    scratch_cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    scratch_cursor.execute(f"GRANT ALL PRIVILEGES ON DATABASE {SCRATCH_DB} TO {DB_USER};")
    scratch_cursor.execute(f"GRANT ALL ON SCHEMA public TO {DB_USER};")
    scratch_cursor.close()
    scratch_conn.close()

    # 4. Run migrate on the fresh DB
    scratch_db_url = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{SCRATCH_DB}"
    env = os.environ.copy()
    env["DATABASE_URL"] = scratch_db_url

    print(f"[4/5] Running 'manage.py migrate' from scratch (0001 to latest) on '{SCRATCH_DB}'...")
    result = subprocess.run(
        [sys.executable, "manage.py", "migrate"],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        env=env,
        capture_output=True,
        text=True,
    )

    print(result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)

    if result.returncode != 0:
        print(f"  [FAIL] Migration on clean DB failed with exit code {result.returncode}")
        # Clean up
        conn = psycopg2.connect(
            dbname="postgres",
            user=SUPER_USER,
            password=SUPER_PASS,
            host=DB_HOST,
            port=DB_PORT,
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        conn.cursor().execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB};")
        conn.close()
        sys.exit(1)

    print("  [PASS] All migrations applied cleanly from scratch with zero errors!")

    # 5. Clean up scratch DB
    print(f"[5/5] Dropping temporary database '{SCRATCH_DB}'...")
    conn = psycopg2.connect(
        dbname="postgres",
        user=SUPER_USER,
        password=SUPER_PASS,
        host=DB_HOST,
        port=DB_PORT,
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    conn.cursor().execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB};")
    conn.close()

    print("=" * 70)
    print("DEFINITION OF DONE VALIDATION PASSED: CLEAN DB MIGRATION SUCCEEDED!")
    print("=" * 70)


if __name__ == "__main__":
    test_fresh_migration()

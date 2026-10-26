"""
Master Verification Suite for Phase 5 Definition of Done:

Definition of Done (Phase 5):
  Running the full scheduled pipeline against fixture/mock sources produces
  normalized, deduplicated, URL-validated, non-expired Internship rows in
  Postgres with zero manual intervention. TC011 passes.

Run:
  cd backend
  source .venv/bin/activate
  python scripts/verify_phase5_definition_of_done.py  (or with -v 0)
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from django.test.runner import DiscoverRunner  # noqa: E402

# The Phase 5 acceptance criterion: full scheduled pipeline with fault isolation
# TC011 verifies that the complete data pipeline works end-to-end with mock sources
TC_TEST_LABELS = [
    "apps.data_sources.tests.Phase5DefinitionOfDoneTest.test_tc011_full_scheduled_pipeline",
]


def run_definition_of_done_verification():
    print("=" * 80)
    print("PHASE 5 DEFINITION OF DONE: MASTER VALIDATION SUITE (TC011)")
    print("=" * 80)

    runner = DiscoverRunner(verbosity=0, interactive=False, failfast=True)

    failures = runner.run_tests(TC_TEST_LABELS)

    print("\n" + "=" * 80)
    if failures:
        print(f"PHASE 5 DEFINITION OF DONE: {failures} CHECK(S) FAILED")
        print("=" * 80)
        sys.exit(1)
    print(f"PHASE 5 DEFINITION OF DONE: ALL {len(TC_TEST_LABELS)} CHECKS PASSED!")
    print("=" * 80)


if __name__ == "__main__":
    run_definition_of_done_verification()

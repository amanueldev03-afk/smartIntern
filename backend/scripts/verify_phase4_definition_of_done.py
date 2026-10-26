"""
Master Verification Suite for Phase 4 Definition of Done:

Definition of Done (Phase 4, Task 4.1):
  Company CRUD (Section 5.4) is exposed at /api/companies/ and gated by
  IsAdminRole. A non-admin (student JWT) receives 403 on every verb; an admin
  can round-trip a company through create -> list -> retrieve -> patch ->
  delete. Table 6.1's TC006 passes as an automated API round-trip.

Run:
  cd backend
  source .venv/bin/activate
  python scripts/verify_phase4_definition_of_done.py  (or with -v 0)
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from django.test.runner import DiscoverRunner  # noqa: E402

# The Phase 4 acceptance criterion from Table 6.1, exercised end-to-end via
# the API: admin-only company CRUD (403 for non-admin, full admin round trip).
TC_TEST_LABELS = [
    "apps.companies.tests.Phase4DefinitionOfDoneTest.test_tc006_non_admin_blocked_admin_crud_round_trips",
]


def run_definition_of_done_verification():
    print("=" * 80)
    print("PHASE 4 DEFINITION OF DONE: MASTER VALIDATION SUITE (TC006)")
    print("=" * 80)

    runner = DiscoverRunner(verbosity=0, interactive=False, failfast=True)

    failures = runner.run_tests(TC_TEST_LABELS)

    print("\n" + "=" * 80)
    if failures:
        print(f"PHASE 4 DEFINITION OF DONE: {failures} CHECK(S) FAILED")
        print("=" * 80)
        sys.exit(1)
    print(f"PHASE 4 DEFINITION OF DONE: ALL {len(TC_TEST_LABELS)} CHECKS PASSED!")
    print("=" * 80)


if __name__ == "__main__":
    run_definition_of_done_verification()
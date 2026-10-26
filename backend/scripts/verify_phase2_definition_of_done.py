"""
Master Verification Suite for Phase 2 Definition of Done:

Definition of Done (Phase 2):
  All of Table 6.1's TC001-TC003 pass as automated tests. A student can
  register -> verify -> login -> refresh -> reset password entirely via API,
  and RBAC blocks cross-role access.

Run:
  cd backend
  source .venv/bin/activate
  python scripts/verify_phase2_definition_of_done.py  (or with -v 0)
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from django.test.runner import DiscoverRunner  # noqa: E402

# The three acceptance criteria from Table 6.1, exercised end-to-end via the API.
TC_TEST_LABELS = [
    "apps.accounts.tests.UserAPITest.test_tc001_registration_via_api",
    "apps.accounts.tests.UserAPITest.test_tc002_verify_and_login_via_api",
    "apps.accounts.tests.UserAPITest.test_tc003_refresh_reset_and_rbac_via_api",
]


def run_definition_of_done_verification():
    print("=" * 80)
    print("PHASE 2 DEFINITION OF DONE: MASTER VALIDATION SUITE (TC001-TC003)")
    print("=" * 80)

    runner = DiscoverRunner(verbosity=0, interactive=False, failfast=True)

    failures = runner.run_tests(TC_TEST_LABELS)

    print("\n" + "=" * 80)
    if failures:
        print(f"PHASE 2 DEFINITION OF DONE: {failures} CHECK(S) FAILED")
        print("=" * 80)
        sys.exit(1)
    print(f"PHASE 2 DEFINITION OF DONE: ALL {len(TC_TEST_LABELS)} CHECKS PASSED!")
    print("=" * 80)


if __name__ == "__main__":
    run_definition_of_done_verification()

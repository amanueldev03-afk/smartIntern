"""
Master Verification Suite for Phase 3 Definition of Done:

Definition of Done (Phase 3):
  A student can complete a full profile end-to-end via the API — personal
  info, education, skills, career interests and preferences (Tasks 3.1-3.3) —
  upload a resume (Task 3.4), parse it asynchronously (Task 3.5), and watch
  the profile-completion percentage (Task 3.6) update live.
  Table 6.1's TC004-TC005 pass as automated tests.

Run:
  cd backend
  source .venv/bin/activate
  python scripts/verify_phase3_definition_of_done.py  (or with -v 0)
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from django.test.runner import DiscoverRunner  # noqa: E402

# The two Phase 3 acceptance criteria from Table 6.1, exercised end-to-end via
# the API: full profile completion, then resume upload with the completion
# percentage updating live.
TC_TEST_LABELS = [
    "apps.students.tests.Phase3DefinitionOfDoneTest.test_tc004_full_profile_completion_via_api",
    "apps.students.tests.Phase3DefinitionOfDoneTest.test_tc005_resume_upload_updates_completion_via_api",
]


def run_definition_of_done_verification():
    print("=" * 80)
    print("PHASE 3 DEFINITION OF DONE: MASTER VALIDATION SUITE (TC004-TC005)")
    print("=" * 80)

    runner = DiscoverRunner(verbosity=0, interactive=False, failfast=True)

    failures = runner.run_tests(TC_TEST_LABELS)

    print("\n" + "=" * 80)
    if failures:
        print(f"PHASE 3 DEFINITION OF DONE: {failures} CHECK(S) FAILED")
        print("=" * 80)
        sys.exit(1)
    print(f"PHASE 3 DEFINITION OF DONE: ALL {len(TC_TEST_LABELS)} CHECKS PASSED!")
    print("=" * 80)


if __name__ == "__main__":
    run_definition_of_done_verification()

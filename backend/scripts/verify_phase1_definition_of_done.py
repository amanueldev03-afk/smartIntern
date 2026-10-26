"""
Master Verification Suite for Phase 1 Definition of Done:

Definition of Done (Phase 1):
1. graph_models output matches Figure 3.1.
2. All 13 entities from Section 3.6 exist with correct FKs, cascade rules, and unique constraints.
3. Full migration history runs cleanly from scratch (migrate on an empty DB, no manual fixups).
"""
import os
import sys
import subprocess
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import django

# Set up Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.apps import apps
from django.db import models
from apps.common.models import TimeStampedModel


def run_definition_of_done_verification():
    print("=" * 80)
    print("PHASE 1 DEFINITION OF DONE: MASTER VALIDATION SUITE")
    print("=" * 80)

    total_checks = 0
    passed_checks = 0

    def check(desc, condition):
        nonlocal total_checks, passed_checks
        total_checks += 1
        if condition:
            print(f"  [PASS] {desc}")
            passed_checks += 1
        else:
            print(f"  [FAIL] {desc}")
            raise AssertionError(f"Check failed: {desc}")

    # =========================================================================
    # 1. ENTITY & CASCADE & CONSTRAINT VALIDATION (Section 3.6 / 3.8.4)
    # =========================================================================
    print("\n--- [1/3] VALIDATING 13 ENTITIES, FOREIGN KEYS, CASCADES & CONSTRAINTS ---")

    entities = [
        ("User", "accounts", False),
        ("Student", "student_profiles", True),
        ("Skill", "internships", True),
        ("StudentSkill", "student_profiles", True),
        ("CareerInterest", "student_profiles", True),
        ("StudentInterest", "student_profiles", True),
        ("Company", "companies", True),
        ("DataSource", "data_sources", True),
        ("Internship", "internships", True),
        ("InternshipSkill", "internships", True),
        ("Recommendation", "recommendations", True),
        ("SavedInternship", "internships", True),
        ("ApplicationHistory", "applications", True),
    ]

    for model_name, app_label, should_inherit_ts in entities:
        model = apps.get_model(app_label, model_name)
        check(f"Entity '{model_name}' exists in app '{app_label}'", model is not None)
        if should_inherit_ts:
            check(f"Entity '{model_name}' inherits TimeStampedModel", issubclass(model, TimeStampedModel))

    # Cascade rules & relationships
    Student = apps.get_model("student_profiles", "Student")
    user_field = Student._meta.get_field("user")
    check("Student.user on_delete is CASCADE", user_field.remote_field.on_delete == models.CASCADE)
    check("Student.user is OneToOne", isinstance(user_field, models.OneToOneField))

    StudentSkill = apps.get_model("student_profiles", "StudentSkill")
    check("StudentSkill.student on_delete is CASCADE", StudentSkill._meta.get_field("student").remote_field.on_delete == models.CASCADE)
    check("StudentSkill.skill on_delete is CASCADE", StudentSkill._meta.get_field("skill").remote_field.on_delete == models.CASCADE)
    ut_ss = list(StudentSkill._meta.unique_together) + [tuple(c.fields) for c in StudentSkill._meta.constraints if isinstance(c, models.UniqueConstraint)]
    check("StudentSkill unique constraint on ('student', 'skill')", ("student", "skill") in ut_ss)

    StudentInterest = apps.get_model("student_profiles", "StudentInterest")
    check("StudentInterest.student on_delete is CASCADE", StudentInterest._meta.get_field("student").remote_field.on_delete == models.CASCADE)
    check("StudentInterest.interest on_delete is CASCADE", StudentInterest._meta.get_field("interest").remote_field.on_delete == models.CASCADE)
    ut_si = list(StudentInterest._meta.unique_together) + [tuple(c.fields) for c in StudentInterest._meta.constraints if isinstance(c, models.UniqueConstraint)]
    check("StudentInterest unique constraint on ('student', 'interest')", ("student", "interest") in ut_si)

    Internship = apps.get_model("internships", "Internship")
    check("Internship.company is nullable", Internship._meta.get_field("company").null is True)
    check("Internship.company on_delete is SET_NULL", Internship._meta.get_field("company").remote_field.on_delete == models.SET_NULL)
    check("Internship.data_source is nullable", Internship._meta.get_field("data_source").null is True)
    check("Internship.data_source on_delete is SET_NULL", Internship._meta.get_field("data_source").remote_field.on_delete == models.SET_NULL)

    InternshipSkill = apps.get_model("internships", "InternshipSkill")
    check("InternshipSkill.internship on_delete is CASCADE", InternshipSkill._meta.get_field("internship").remote_field.on_delete == models.CASCADE)
    check("InternshipSkill.skill on_delete is CASCADE", InternshipSkill._meta.get_field("skill").remote_field.on_delete == models.CASCADE)
    ut_is = list(InternshipSkill._meta.unique_together) + [tuple(c.fields) for c in InternshipSkill._meta.constraints if isinstance(c, models.UniqueConstraint)]
    check("InternshipSkill unique constraint on ('internship', 'skill')", ("internship", "skill") in ut_is)

    Recommendation = apps.get_model("recommendations", "Recommendation")
    check("Recommendation.student on_delete is CASCADE", Recommendation._meta.get_field("student").remote_field.on_delete == models.CASCADE)
    check("Recommendation.internship on_delete is CASCADE", Recommendation._meta.get_field("internship").remote_field.on_delete == models.CASCADE)
    ut_rec = list(Recommendation._meta.unique_together) + [tuple(c.fields) for c in Recommendation._meta.constraints if isinstance(c, models.UniqueConstraint)]
    check("Recommendation unique constraint on ('student', 'internship')", ("student", "internship") in ut_rec)

    SavedInternship = apps.get_model("internships", "SavedInternship")
    check("SavedInternship.student on_delete is CASCADE", SavedInternship._meta.get_field("student").remote_field.on_delete == models.CASCADE)
    check("SavedInternship.internship on_delete is CASCADE", SavedInternship._meta.get_field("internship").remote_field.on_delete == models.CASCADE)
    ut_save = list(SavedInternship._meta.unique_together) + [tuple(c.fields) for c in SavedInternship._meta.constraints if isinstance(c, models.UniqueConstraint)]
    check("SavedInternship unique constraint on ('student', 'internship')", ("student", "internship") in ut_save)

    ApplicationHistory = apps.get_model("applications", "ApplicationHistory")
    check("ApplicationHistory.student on_delete is CASCADE", ApplicationHistory._meta.get_field("student").remote_field.on_delete == models.CASCADE)
    check("ApplicationHistory.internship on_delete is CASCADE", ApplicationHistory._meta.get_field("internship").remote_field.on_delete == models.CASCADE)
    ut_app = list(ApplicationHistory._meta.unique_together) + [tuple(c.fields) for c in ApplicationHistory._meta.constraints if isinstance(c, models.UniqueConstraint)]
    check("ApplicationHistory unique constraint on ('student', 'internship')", ("student", "internship") in ut_app)

    # =========================================================================
    # 2. GRAPH_MODELS GENERATION & FIGURE 3.1 MATCH
    # =========================================================================
    print("\n--- [2/3] VALIDATING GRAPH_MODELS OUTPUT AGAINST FIGURE 3.1 ---")
    dot_cmd = [
        sys.executable,
        "manage.py",
        "graph_models",
        "accounts",
        "student_profiles",
        "internships",
        "recommendations",
        "companies",
        "data_sources",
        "applications",
        "--dot",
    ]
    graph_proc = subprocess.run(
        dot_cmd,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        capture_output=True,
        text=True,
    )
    check("graph_models execution exit code is 0", graph_proc.returncode == 0)
    dot_output = graph_proc.stdout
    check("graph_models output contains Student -> User relation", "apps_students_models_Student -> apps_accounts_models_User" in dot_output)
    check("graph_models output contains StudentSkill -> Student relation", "apps_students_models_StudentSkill -> apps_students_models_Student" in dot_output)
    check("graph_models output contains StudentSkill -> Skill relation", "apps_students_models_StudentSkill -> apps_internships_models_Skill" in dot_output)
    check("graph_models output contains Internship -> Company relation", "apps_internships_models_Internship -> apps_companies_models_Company" in dot_output)
    check("graph_models output contains Internship -> DataSource relation", "apps_internships_models_Internship -> apps_data_sources_models_DataSource" in dot_output)
    check("graph_models output contains InternshipSkill -> Internship relation", "apps_internships_models_InternshipSkill -> apps_internships_models_Internship" in dot_output)
    check("graph_models output contains Recommendation -> User relation", "apps_recommendations_models_Recommendation -> apps_accounts_models_User" in dot_output)
    check("graph_models output contains Recommendation -> Internship relation", "apps_recommendations_models_Recommendation -> apps_internships_models_Internship" in dot_output)
    check("graph_models output contains ApplicationHistory -> User relation", "apps_applications_models_ApplicationHistory -> apps_accounts_models_User" in dot_output)

    # =========================================================================
    # 3. CLEAN DB MIGRATION TEST FROM SCRATCH (0001 TO LATEST)
    # =========================================================================
    print("\n--- [3/3] VALIDATING CLEAN MIGRATION FROM SCRATCH ON EMPTY DB ---")
    DB_USER = "ai_user"
    DB_PASS = "ai_password"
    DB_HOST = "localhost"
    DB_PORT = "5432"
    SUPER_USER = "postgres"
    SUPER_PASS = "postgres"
    SCRATCH_DB = "ai_internship_dod_test"

    conn = psycopg2.connect(dbname="postgres", user=SUPER_USER, password=SUPER_PASS, host=DB_HOST, port=DB_PORT)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()
    cursor.execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB};")
    cursor.execute(f"CREATE DATABASE {SCRATCH_DB} OWNER {DB_USER};")
    cursor.close()
    conn.close()

    scratch_conn = psycopg2.connect(dbname=SCRATCH_DB, user=SUPER_USER, password=SUPER_PASS, host=DB_HOST, port=DB_PORT)
    scratch_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    scratch_cursor = scratch_conn.cursor()
    scratch_cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    scratch_cursor.execute(f"GRANT ALL PRIVILEGES ON DATABASE {SCRATCH_DB} TO {DB_USER};")
    scratch_cursor.execute(f"GRANT ALL ON SCHEMA public TO {DB_USER};")
    scratch_cursor.close()
    scratch_conn.close()

    scratch_db_url = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{SCRATCH_DB}"
    env = os.environ.copy()
    env["DATABASE_URL"] = scratch_db_url

    mig_proc = subprocess.run(
        [sys.executable, "manage.py", "migrate"],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        env=env,
        capture_output=True,
        text=True,
    )
    check("Full migrations apply cleanly from scratch with 0 errors (exit code 0)", mig_proc.returncode == 0)

    # Cleanup scratch DB
    conn = psycopg2.connect(dbname="postgres", user=SUPER_USER, password=SUPER_PASS, host=DB_HOST, port=DB_PORT)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    conn.cursor().execute(f"DROP DATABASE IF EXISTS {SCRATCH_DB};")
    conn.close()

    print("\n" + "=" * 80)
    print(f"PHASE 1 DEFINITION OF DONE: ALL {passed_checks}/{total_checks} CHECKS PASSED!")
    print("=" * 80)


if __name__ == "__main__":
    run_definition_of_done_verification()

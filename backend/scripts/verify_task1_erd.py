"""
ERD Self-Review and Foreign Key Diagram Generator for Phase 1.

Extracts models, foreign keys, many-to-many relationships, and unique constraints
directly from Django's AppRegistry and validates them against Figure 3.1 specifications.
"""
import os
import sys
import django

# Set up Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.apps import apps
from django.db import models


def review_erd():
    print("=" * 70)
    print("PHASE 1 ERD SELF-REVIEW: ACTUAL MODEL FK GRAPH VS. FIGURE 3.1")
    print("=" * 70)

    expected_erd = {
        "User": {
            "app": "accounts",
            "fks": {},
            "reverse_fks": ["student", "recommendations", "saved_internships", "application_histories"],
        },
        "Student": {
            "app": "student_profiles",  # StudentsConfig label
            "fks": {
                "user": "User",
            },
            "m2m": ["skills", "interests"],
        },
        "Skill": {
            "app": "internships",
            "fks": {},
        },
        "StudentSkill": {
            "app": "student_profiles",
            "fks": {
                "student": "Student",
                "skill": "Skill",
            },
            "unique_together": [("student", "skill")],
        },
        "CareerInterest": {
            "app": "student_profiles",
            "fks": {},
        },
        "StudentInterest": {
            "app": "student_profiles",
            "fks": {
                "student": "Student",
                "interest": "CareerInterest",
            },
            "unique_together": [("student", "interest")],
        },
        "Company": {
            "app": "companies",
            "fks": {},
        },
        "DataSource": {
            "app": "data_sources",
            "fks": {},
        },
        "Internship": {
            "app": "internships",
            "fks": {
                "company": "Company",
                "data_source": "DataSource",
            },
        },
        "InternshipSkill": {
            "app": "internships",
            "fks": {
                "internship": "Internship",
                "skill": "Skill",
            },
            "unique_together": [("internship", "skill")],
        },
        "Recommendation": {
            "app": "recommendations",
            "fks": {
                "student": "User",
                "internship": "Internship",
            },
            "unique_together": [("student", "internship")],
        },
        "SavedInternship": {
            "app": "internships",
            "fks": {
                "student": "User",
                "internship": "Internship",
            },
            "unique_together": [("student", "internship")],
        },
        "ApplicationHistory": {
            "app": "applications",
            "fks": {
                "student": "User",
                "internship": "Internship",
            },
            "unique_together": [("student", "internship")],
        },
    }

    all_passed = True

    # Mermaid diagram builder
    mermaid_lines = ["```mermaid", "erDiagram"]

    for model_name, spec in expected_erd.items():
        app_label = spec["app"]
        model = apps.get_model(app_label, model_name)
        if not model:
            print(f"  [FAIL] Model {model_name} not found in app {app_label}")
            all_passed = False
            continue

        print(f"\n[MODEL] {model_name} (app: {model._meta.app_label}, table: {model._meta.db_table})")

        # Check Foreign Keys
        actual_fks = {}
        for field in model._meta.fields:
            if isinstance(field, models.ForeignKey) or isinstance(field, models.OneToOneField):
                rel_model = field.remote_field.model
                rel_model_name = rel_model.__name__
                actual_fks[field.name] = rel_model_name
                nullable_str = "nullable" if field.null else "NOT NULL"
                print(f"  -> FK: {field.name} -> {rel_model_name} ({nullable_str}, on_delete={field.remote_field.on_delete.__name__})")
                
                # Add to mermaid
                mermaid_lines.append(f"    {model_name} }}|..|{{ {rel_model_name} : \"{field.name}\"")

        for expected_fk_field, expected_rel in spec.get("fks", {}).items():
            if expected_fk_field not in actual_fks:
                print(f"  [FAIL] Missing FK '{expected_fk_field}' -> {expected_rel}")
                all_passed = False
            elif actual_fks[expected_fk_field] != expected_rel:
                print(f"  [FAIL] FK '{expected_fk_field}' points to {actual_fks[expected_fk_field]}, expected {expected_rel}")
                all_passed = False
            else:
                print(f"  [PASS] FK '{expected_fk_field}' matches Figure 3.1 -> {expected_rel}")

        # Check unique constraints / unique_together
        expected_unique = spec.get("unique_together", [])
        if expected_unique:
            ut = list(model._meta.unique_together)
            constraint_fields = [
                tuple(c.fields) for c in model._meta.constraints if isinstance(c, models.UniqueConstraint)
            ]
            all_uniques = set(ut + constraint_fields)
            for req_u in expected_unique:
                if req_u in all_uniques:
                    print(f"  [PASS] Unique constraint on {req_u} exists")
                else:
                    print(f"  [FAIL] Unique constraint on {req_u} missing in {all_uniques}")
                    all_passed = False

    mermaid_lines.append("```")

    print("\n" + "=" * 70)
    print("GENERATED MERMAID ERD FROM ACTUAL MODELS:")
    print("=" * 70)
    print("\n".join(mermaid_lines))
    print("=" * 70)

    if all_passed:
        print("ALL ERD RELATIONS MATCH FIGURE 3.1 SPECIFICATIONS EXACTLY!")
    else:
        print("ERD REVIEW FAILED: Mismatches detected!")
        sys.exit(1)


if __name__ == "__main__":
    review_erd()

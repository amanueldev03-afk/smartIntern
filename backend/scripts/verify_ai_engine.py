"""
Task 0.5 verification script.

Run from backend/ with:
    python scripts/verify_ai_engine.py

Checks:
  1. ai_engine package imports without errors
  2. All submodules import without errors
  3. stub_score() returns {"score": 0}
  4. Full pipeline: StudentInput + InternshipInput → RecommendationOutput
  5. spaCy loads en_core_web_sm
  6. sentence-transformers and scikit-learn are importable

This script does NOT require Django or a database connection.
"""

import sys
import os

# Ensure backend/ is on the path so ai_engine is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

errors: list[str] = []
passed: list[str] = []


def check(label: str, fn):
    try:
        result = fn()
        passed.append(f"  ✓  {label}" + (f"  →  {result}" if result is not None else ""))
    except Exception as exc:
        errors.append(f"  ✗  {label}  →  {type(exc).__name__}: {exc}")


# ------------------------------------------------------------------
# 1. Top-level package
# ------------------------------------------------------------------
check("import ai_engine", lambda: __import__("ai_engine"))

# ------------------------------------------------------------------
# 2. Submodules
# ------------------------------------------------------------------
check("import ai_engine.models",           lambda: __import__("ai_engine.models"))
check("import ai_engine.embeddings",       lambda: __import__("ai_engine.embeddings"))
check("import ai_engine.resume_parser",    lambda: __import__("ai_engine.resume_parser"))
check("import ai_engine.skill_matching",   lambda: __import__("ai_engine.skill_matching"))
check("import ai_engine.semantic_matching",lambda: __import__("ai_engine.semantic_matching"))
check("import ai_engine.ranking",          lambda: __import__("ai_engine.ranking"))
check("import ai_engine.recommendation",   lambda: __import__("ai_engine.recommendation"))
check("import ai_engine.explanation",      lambda: __import__("ai_engine.explanation"))

# ------------------------------------------------------------------
# 3. stub_score() returns {"score": 0}
# ------------------------------------------------------------------
def _stub_check():
    from ai_engine.recommendation import stub_score
    result = stub_score()
    assert result == {"score": 0}, f"Expected {{'score': 0}}, got {result}"
    return result

check("stub_score() == {'score': 0}", _stub_check)

# ------------------------------------------------------------------
# 4. Full pipeline with stub data (no embeddings, no DB)
# ------------------------------------------------------------------
def _pipeline_check():
    from ai_engine.models import StudentInput, InternshipInput
    from ai_engine.recommendation import recommend

    student = StudentInput(
        user_id=1,
        skills=["python", "django", "react"],
        field_of_study="Computer Science",
        country="Ethiopia",
        city="Addis Ababa",
    )
    internships = [
        InternshipInput(
            internship_id=1,
            title="Backend Developer Intern",
            description="Python Django REST API development",
            required_skills=["python", "django"],
            internship_type="remote",
            country="Ethiopia",
        ),
        InternshipInput(
            internship_id=2,
            title="Frontend Intern",
            description="React and TypeScript development",
            required_skills=["react", "typescript"],
            internship_type="onsite",
            country="USA",
        ),
    ]
    results = recommend(student, internships)
    assert len(results) == 2, f"Expected 2 results, got {len(results)}"
    assert results[0].score >= results[1].score, "Results not sorted"
    return f"{len(results)} results, top score={results[0].score}"

check("recommend() pipeline", _pipeline_check)

# ------------------------------------------------------------------
# 5. ScoreBreakdown dataclass
# ------------------------------------------------------------------
def _dataclass_check():
    from ai_engine.models import ScoreBreakdown, RecommendationOutput
    bd = ScoreBreakdown(skill=0.8, semantic=0.6, location=1.0, work_mode=1.0)
    out = RecommendationOutput(internship_id=99, score=72.5, breakdown=bd)
    assert out.internship_id == 99
    return f"score={out.score}"

check("ScoreBreakdown + RecommendationOutput dataclasses", _dataclass_check)

# ------------------------------------------------------------------
# 6. spaCy loads en_core_web_sm
# ------------------------------------------------------------------
def _spacy_check():
    import spacy
    nlp = spacy.load("en_core_web_sm")
    doc = nlp("Google is a company based in California.")
    orgs = [e.text for e in doc.ents if e.label_ == "ORG"]
    return f"spacy {spacy.__version__}, ORGs={orgs}"

check("spacy.load('en_core_web_sm')", _spacy_check)

# ------------------------------------------------------------------
# 7. sentence-transformers
# ------------------------------------------------------------------
check(
    "import sentence_transformers",
    lambda: __import__("sentence_transformers"),
)

# ------------------------------------------------------------------
# 8. scikit-learn
# ------------------------------------------------------------------
check("import sklearn", lambda: __import__("sklearn"))

# ------------------------------------------------------------------
# Results
# ------------------------------------------------------------------
print("\nAI Engine Verification")
print("=" * 50)
for line in passed:
    print(line)
if errors:
    print()
    for line in errors:
        print(line)
    print(f"\n{len(errors)} check(s) FAILED — see above.")
    sys.exit(1)
else:
    print(f"\nAll {len(passed)} checks passed.")
    sys.exit(0)

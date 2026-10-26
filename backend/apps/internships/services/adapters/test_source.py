from .base import BaseInternshipAdapter


class TestInternshipAdapter(BaseInternshipAdapter):
    """
    Development adapter used for testing the
    collection pipeline.
    """

    def fetch(self):
        return [
            {
                "external_id": "TEST-001",

                "title": "Python Backend Intern",

                "organization_name": (
                    "Example Technology"
                ),

                "description": (
                    "Backend development internship."
                ),

                "category": "Software Engineering",

                "country": "Ethiopia",

                "city": "Addis Ababa",

                "location_text": "Addis Ababa",

                "internship_type": "remote",

                "work_type": "part_time",

                "compensation_type": "paid",

                "minimum_compensation": 300,

                "maximum_compensation": 600,

                "compensation_currency": "USD",

                "compensation_period": "monthly",

                "required_skills": [
                    "Python",
                    "Django",
                    "PostgreSQL",
                ],

                "preferred_skills": [
                    "Docker",
                    "REST API",
                ],

                "duration_min_weeks": 8,

                "duration_max_weeks": 16,

                "application_url": (
                    "https://example.com/apply"
                ),

                "source_url": (
                    "https://example.com/"
                    "internships/TEST-001"
                ),
            },

            {
                "external_id": "TEST-002",

                "title": "Frontend React Intern",

                "organization_name": (
                    "Example Digital"
                ),

                "description": (
                    "Frontend development internship."
                ),

                "category": "Frontend Development",

                "country": "Ethiopia",

                "city": "Addis Ababa",

                "location_text": "Addis Ababa",

                "internship_type": "hybrid",

                "work_type": "part_time",

                "compensation_type": "unpaid",

                "required_skills": [
                    "React",
                    "TypeScript",
                    "JavaScript",
                ],

                "preferred_skills": [
                    "Tailwind CSS",
                ],

                "duration_min_weeks": 10,

                "duration_max_weeks": 20,

                "application_url": (
                    "https://example.com/apply/react"
                ),

                "source_url": (
                    "https://example.com/"
                    "internships/TEST-002"
                ),
            },
        ]
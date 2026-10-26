from django.db import transaction
from django.utils import timezone

from apps.internships.models import (
    Internship,
    InternshipCollectionLog,
)

from .adapters.registry import get_adapter


class InternshipCollector:
    """
    Service responsible for processing internship
    records returned by a source adapter.
    """

    def __init__(self, source):
        self.source = source

    @transaction.atomic
    def collect(self, records):
        """
        Process a list of internship records.
        """

        log = InternshipCollectionLog.objects.create(
            source=self.source,
            status="running",
        )

        created_count = 0
        updated_count = 0
        failed_count = 0

        created_or_updated_ids = []

        log.records_found = len(records)
        log.save(update_fields=["records_found"])

        for data in records:

            try:
                normalized_data = self.normalize(data)

                existing = Internship.objects.filter(
                    source=self.source,
                    external_id=normalized_data["external_id"],
                ).first()

                if existing:
                    meaningful_update = any(
                        getattr(existing, field) != normalized_data[field]
                        for field in (
                            "title", "organization_name", "description",
                            "application_url", "application_deadline",
                        )
                    )
                    # Update data but preserve publication status.
                    existing.title = normalized_data["title"]
                    existing.description = normalized_data["description"]
                    existing.application_url = normalized_data["application_url"]
                    existing.save()
                    created_or_updated_ids.append(existing.id)
                    if meaningful_update:
                        from apps.notifications.tasks import send_saved_internship_update_notifications
                        transaction.on_commit(
                            lambda internship_id=existing.id: send_saved_internship_update_notifications.delay(
                                internship_id
                            )
                        )
                    updated_count += 1
                else:
                    created_internship = Internship.objects.create(
                        source=self.source,
                        **normalized_data,
                    )
                    created_or_updated_ids.append(created_internship.id)
                    created_count += 1

            except Exception as exc:
                failed_count += 1

                log.error_message += (
                    f"{data.get('external_id', 'unknown')}: "
                    f"{str(exc)}\n"
                )

        # Queue URL validation for new/updated listings (Task 5.9)
        try:
            from apps.internships.tasks import validate_listing_urls_task
            transaction.on_commit(
                lambda: [
                    validate_listing_urls_task.delay(iid)
                    for iid in created_or_updated_ids
                ]
            )
        except Exception:
            pass

        log.records_created = created_count
        log.records_updated = updated_count
        log.records_failed = failed_count
        log.completed_at = timezone.now()

        if failed_count == 0:
            log.status = "success"
        elif created_count or updated_count:
            log.status = "partial"
        else:
            log.status = "failed"

        log.save(
            update_fields=[
                "records_created",
                "records_updated",
                "records_failed",
                "completed_at",
                "status",
                "error_message",
            ]
        )

        return log

    def normalize(self, data):
        """
        Normalize external data into our internal
        Internship structure.
        """

        return {
            "title": data["title"].strip(),

            "organization_name": data[
                "organization_name"
            ].strip(),

            "description": data.get(
                "description",
                "",
            ).strip(),

            "category": data.get(
                "category",
                "",
            ).strip(),

            "country": data.get(
                "country",
                "",
            ).strip(),

            "city": data.get(
                "city",
                "",
            ).strip(),

            "location_text": data.get(
                "location_text",
                "",
            ).strip(),

            "internship_type": data.get(
                "internship_type",
                "onsite",
            ),

            "work_type": data.get(
                "work_type",
                "full_time",
            ),

            "compensation_type": data.get(
                "compensation_type",
                "unknown",
            ),

            "minimum_compensation": data.get(
                "minimum_compensation",
            ),

            "maximum_compensation": data.get(
                "maximum_compensation",
            ),

            "compensation_currency": data.get(
                "compensation_currency",
                "",
            ),

            "compensation_period": data.get(
                "compensation_period",
                "",
            ),

            "preferred_skills": data.get(
                "preferred_skills",
                [],
            ),

            "duration_min_weeks": data.get(
                "duration_min_weeks",
            ),

            "duration_max_weeks": data.get(
                "duration_max_weeks",
            ),

            "application_url": data[
                "application_url"
            ],

            "source_url": data.get(
                "source_url",
                "",
            ),

            "external_id": str(
                data["external_id"]
            ),

            "posted_at": data.get(
                "posted_at",
            ),

            "application_deadline": data.get(
                "application_deadline",
            ),

            "is_verified": False,

            "status": "draft",
        }


def collect_source(source):
    """
    Collect internships from a configured source.
    """

    if not source.is_active:
        raise ValueError(
            "This internship source is inactive."
        )

    adapter = get_adapter(source)

    records = adapter.fetch()

    collector = InternshipCollector(source)

    return collector.collect(records)

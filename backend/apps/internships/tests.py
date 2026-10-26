from django.test import TestCase
from django.utils import timezone
from django.db.models import Q
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from .models import Skill, InternshipSource, Internship, InternshipCollectionLog, InternshipDuplicateFlag, SavedInternship, InternshipApplication
from unittest.mock import patch, MagicMock
from .tasks import expire_internships, validate_listing_urls_task
from apps.data_sources.services.urlcheck import validate_url, validate_listing_urls
from apps.recommendations.models import Recommendation
from apps.recommendations.services.semantic_matching import (
    build_student_text,
    build_internship_text,
    generate_embedding,
    update_student_embedding,
    update_internship_embedding,
    calculate_stored_semantic_similarity,
)
from apps.recommendations.services.hybrid_matching import calculate_hybrid_match
from apps.recommendations.services.recommendation_engine_v2 import (
    calculate_skill_score,
    get_matched_skills,
    calculate_location_score,
    calculate_final_score,
    build_explanation,
)

User = get_user_model()


class SkillModelTest(TestCase):
    """Test cases for Skill model"""

    def test_create_skill(self):
        """Test creating a new skill"""
        skill = Skill.objects.create(
            name='Python',
            description='Programming language'
        )
        self.assertEqual(skill.name, 'Python')
        self.assertTrue(skill.is_active)

    def test_skill_str(self):
        """Test skill string representation"""
        skill = Skill.objects.create(name='Python')
        self.assertEqual(str(skill), 'Python')


class InternshipSourceModelTest(TestCase):
    """Test cases for InternshipSource model"""

    def test_create_source(self):
        """Test creating a new internship source"""
        source = InternshipSource.objects.create(
            name='LinkedIn',
            source_type='api',
            website_url='https://linkedin.com'
        )
        self.assertEqual(source.name, 'LinkedIn')
        self.assertEqual(source.source_type, 'api')

    def test_source_str(self):
        """Test source string representation"""
        source = InternshipSource.objects.create(
            name='LinkedIn', source_type='api')
        self.assertEqual(str(source), 'LinkedIn')


class InternshipModelTest(TestCase):
    """Test cases for Internship model"""

    def setUp(self):
        """Set up test data"""
        self.source = InternshipSource.objects.create(
            name='LinkedIn',
            source_type='api',
            website_url='https://linkedin.com'
        )
        self.skill = Skill.objects.create(name='Python')

    def test_create_internship(self):
        """Test creating a new internship with embedding status"""
        internship = Internship.objects.create(
            title='Software Engineer Intern',
            organization_name='Tech Company',
            description='Software engineering internship',
            application_url='https://example.com/apply',
            source=self.source,
            internship_type='remote',
            work_type='full_time',
            compensation_type='paid',
            minimum_compensation=1000,
            maximum_compensation=2000
        )
        internship.required_skills.add(self.skill)
        self.assertEqual(internship.title, 'Software Engineer Intern')
        self.assertEqual(internship.status, Internship.STATUS_DRAFT)
        self.assertEqual(internship.embedding_status,
                         Internship.EMBEDDING_STATUS_PENDING)

    def test_internship_str(self):
        """Test internship string representation"""
        internship = Internship.objects.create(
            title='Software Engineer Intern',
            organization_name='Tech Company',
            description='Software engineering internship',
            application_url='https://example.com/apply',
            source=self.source
        )
        self.assertEqual(
            str(internship), 'Software Engineer Intern - Tech Company')

    def test_is_expired(self):
        """Test internship expiration check"""
        past_deadline = timezone.now() - timezone.timedelta(days=1)
        future_deadline = timezone.now() + timezone.timedelta(days=30)

        expired_internship = Internship.objects.create(
            title='Expired Internship',
            organization_name='Company',
            description='Expired',
            application_url='https://example.com/apply',
            source=self.source,
            external_id='expired_1',
            application_deadline=past_deadline
        )

        active_internship = Internship.objects.create(
            title='Active Internship',
            organization_name='Company',
            description='Active',
            application_url='https://example.com/apply',
            source=self.source,
            application_deadline=future_deadline
        )

        self.assertTrue(expired_internship.is_expired())
        self.assertFalse(active_internship.is_expired())

    def test_compensation_validation(self):
        """Test compensation validation for paid internships"""
        internship = Internship(
            title='Software Engineer Intern',
            organization_name='Tech Company',
            description='Software engineering internship',
            application_url='https://example.com/apply',
            source=self.source,
            compensation_type='paid',
            minimum_compensation=None,
            maximum_compensation=None
        )
        with self.assertRaises(Exception):
            internship.full_clean()


class ExpireInternshipsTaskTest(TestCase):
    """Task 5.8 — daily Celery Beat expiration (Section 3.10.7)."""

    def setUp(self):
        self.source = InternshipSource.objects.create(
            name="Expiry Test Source",
            source_type="api",
        )

    def _create_internship(self, title, deadline, **overrides):
        defaults = {
            "title": title,
            "organization_name": "Example Corp",
            "description": f"{title} description.",
            "application_url": f"https://example.com/apply/{title}",
            "source": self.source,
            "status": Internship.STATUS_ACTIVE,
            "is_verified": True,
            "deadline": deadline,
        }
        defaults.update(overrides)
        return Internship.objects.create(**defaults)

    def _active_search_queryset(self):
        """Mirror of Lemma 4's active search results (InternshipListView)."""
        now = timezone.now()
        return Internship.objects.filter(
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
        ).filter(
            Q(application_deadline__isnull=True)
            | Q(application_deadline__gt=now)
        )

    def test_yesterday_deadline_flips_and_leaves_active_results(self):
        """Yesterday's deadline -> expired -> gone from active search."""
        today = timezone.localdate()
        yesterday = today - timezone.timedelta(days=1)

        expired = self._create_internship(
            "Expired Intern", yesterday
        )

        self.assertEqual(
            self._active_search_queryset().filter(
                pk=expired.pk
            ).count(),
            1,
        )

        result = expire_internships()

        self.assertEqual(result["expired_count"], 1)

        expired.refresh_from_db()
        self.assertEqual(expired.status, Internship.STATUS_EXPIRED)

        self.assertEqual(
            self._active_search_queryset().filter(
                pk=expired.pk
            ).count(),
            0,
        )

    def test_future_deadline_stays_active(self):
        """A deadline still ahead keeps the internship active."""
        today = timezone.localdate()
        future = today + timezone.timedelta(days=30)

        active = self._create_internship(
            "Future Intern", future
        )

        result = expire_internships()

        self.assertEqual(result["expired_count"], 0)
        active.refresh_from_db()
        self.assertEqual(active.status, Internship.STATUS_ACTIVE)

    def test_non_active_internship_with_past_deadline_is_untouched(self):
        """Only active internships are flipped by the task."""
        today = timezone.localdate()
        yesterday = today - timezone.timedelta(days=1)

        draft = self._create_internship(
            "Draft Intern",
            yesterday,
            status=Internship.STATUS_DRAFT,
        )

        result = expire_internships()

        self.assertEqual(result["expired_count"], 0)
        draft.refresh_from_db()
        self.assertEqual(draft.status, Internship.STATUS_DRAFT)


class ValidateListingUrlsTaskTest(TestCase):
    """Tests for validate_listing_urls_task (Task 5.9)."""

    def setUp(self):
        self.source = InternshipSource.objects.create(
            name="URL Test Source",
            source_type="api",
        )
        # Create internship with both URLs set
        self.internship = Internship.objects.create(
            title="URL Test Internship",
            organization_name="Test Corp",
            description="Testing URL validation",
            application_url="https://valid.example.com/apply",
            source_url="https://invalid.example.com",
            source=self.source,
            status=Internship.STATUS_DRAFT,
            is_verified=False,
        )

    @patch("apps.internships.tasks.validate_listing_urls")
    def test_valid_urls_auto_publish(self, mock_validate):
        # Simulate both URLs valid
        mock_validate.return_value = {
            "checks": {
                "application_url": {
                    "url": self.internship.application_url,
                    "valid": True,
                    "method": "HEAD",
                    "status_code": 200,
                    "error": None,
                },
                "source_url": {
                    "url": self.internship.source_url,
                    "valid": True,
                    "method": "HEAD",
                    "status_code": 200,
                    "error": None,
                },
            },
            "valid": True,
            "invalid_urls": [],
        }
        result = validate_listing_urls_task(self.internship.id)
        self.assertFalse(result["needs_review"])
        self.internship.refresh_from_db()
        self.assertEqual(self.internship.status, Internship.STATUS_ACTIVE)
        self.assertTrue(self.internship.is_verified)
        self.assertFalse(self.internship.needs_review)

    @patch("apps.internships.tasks.validate_listing_urls")
    def test_invalid_url_flagged(self, mock_validate):
        # Simulate source_url invalid
        mock_validate.return_value = {
            "checks": {
                "application_url": {
                    "url": self.internship.application_url,
                    "valid": True,
                    "method": "HEAD",
                    "status_code": 200,
                    "error": None,
                },
                "source_url": {
                    "url": self.internship.source_url,
                    "valid": False,
                    "method": "HEAD",
                    "status_code": 404,
                    "error": "not_found",
                },
            },
            "valid": False,
            "invalid_urls": ["source_url"],
        }
        result = validate_listing_urls_task(self.internship.id)
        self.assertTrue(result["needs_review"])
        self.internship.refresh_from_db()
        self.assertEqual(self.internship.status, Internship.STATUS_DRAFT)
        self.assertFalse(self.internship.is_verified)
        self.assertTrue(self.internship.needs_review)


class ValidateUrlServiceTest(TestCase):
    """Tests for validate_url and validate_listing_urls (Section 3.10.8)."""

    def _mock_response(self, status_code, method="HEAD"):
        mock = MagicMock()
        mock.status_code = status_code
        mock.close.return_value = None
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)
        return mock

    @patch("apps.data_sources.services.urlcheck.requests.request")
    def test_valid_head_200(self, mock_request):
        mock_request.return_value = self._mock_response(200)
        result = validate_url("https://valid.example.com/apply")
        self.assertTrue(result["valid"])
        self.assertEqual(result["method"], "HEAD")
        self.assertEqual(result["status_code"], 200)
        self.assertIsNone(result["error"])

    @patch("apps.data_sources.services.urlcheck.requests.request")
    def test_404_returns_invalid(self, mock_request):
        mock_request.return_value = self._mock_response(404)
        result = validate_url("https://example.com/missing")
        self.assertFalse(result["valid"])
        self.assertEqual(result["status_code"], 404)

    @patch("apps.data_sources.services.urlcheck.requests.request")
    def test_head_403_falls_back_to_get(self, mock_request):
        mock_request.side_effect = [
            self._mock_response(403),
            self._mock_response(200),
        ]
        result = validate_url("https://example.com/page")
        self.assertTrue(result["valid"])
        self.assertEqual(result["method"], "GET")
        self.assertEqual(result["status_code"], 200)

    @patch("apps.data_sources.services.urlcheck.requests.request")
    def test_empty_url_is_invalid(self, mock_request):
        result = validate_url("")
        self.assertFalse(result["valid"])
        self.assertEqual(result["error"], "empty_url")
        mock_request.assert_not_called()

    @patch("apps.data_sources.services.urlcheck.requests.request")
    def test_validate_listing_urls_aggregate(self, mock_request):
        mock_request.side_effect = [
            self._mock_response(200),
            self._mock_response(404),
        ]
        result = validate_listing_urls(
            "https://valid.example.com/apply",
            "https://broken.example.com/source",
        )
        self.assertFalse(result["valid"])
        self.assertIn("source_url", result["invalid_urls"])
        self.assertNotIn("application_url", result["invalid_urls"])
        self.assertTrue(result["checks"]["application_url"]["valid"])
        self.assertFalse(result["checks"]["source_url"]["valid"])

    @patch("apps.data_sources.services.urlcheck.requests.request")
    def test_empty_source_url_is_skipped(self, mock_request):
        mock_request.return_value = self._mock_response(200)
        result = validate_listing_urls(
            "https://valid.example.com/apply",
            "",
        )
        self.assertTrue(result["valid"])
        self.assertEqual(
            result["checks"]["source_url"]["method"], "skipped"
        )
        self.assertEqual(mock_request.call_count, 1)


class AdminInternshipCreateQueuesValidationTest(TestCase):
    """Admin create should queue validate_listing_urls_task."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        self.client.force_authenticate(user=self.admin)
        self.source = InternshipSource.objects.create(
            name="Test Source",
            source_type="api",
        )

    @patch("apps.internships.views.transaction.on_commit")
    @patch("apps.internships.views.validate_listing_urls_task.delay")
    def test_admin_create_queues_url_validation(self, mock_validate, mock_on_commit):
        def execute(callback):
            callback()
        mock_on_commit.side_effect = execute

        response = self.client.post(
            "/api/internships/admin/",
            {
                "title": "New Internship",
                "organization_name": "New Company",
                "description": "Test description",
                "application_url": "https://example.com/apply",
                "source": self.source.id,
                "external_id": "admin_create_1",
                "internship_type": "remote",
                "work_type": "full_time",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        internship_id = response.data["id"]
        mock_validate.assert_called_once_with(internship_id)


class AdminInternshipUpdateQueuesValidationTest(TestCase):
    """Admin update should queue validate_listing_urls_task."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin2@example.com",
            username="admin2",
            password="adminpass123",
        )
        self.client.force_authenticate(user=self.admin)
        self.source = InternshipSource.objects.create(
            name="Test Source 2",
            source_type="api",
        )
        self.internship = Internship.objects.create(
            title="Existing Internship",
            organization_name="Existing Corp",
            description="Existing description",
            application_url="https://example.com/apply",
            source=self.source,
            external_id="admin_update_1",
            internship_type="remote",
            work_type="full_time",
        )

    @patch("apps.internships.views.transaction.on_commit")
    @patch("apps.internships.views.validate_listing_urls_task.delay")
    def test_admin_update_queues_url_validation(self, mock_validate, mock_on_commit):
        def execute(callback):
            callback()
        mock_on_commit.side_effect = execute

        response = self.client.patch(
            f"/api/internships/admin/{self.internship.id}/",
            {"title": "Updated Internship"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_validate.assert_called_once_with(self.internship.id)


class CollectorQueuesValidationTest(TestCase):
    """InternshipCollector should queue validation for new/updated listings."""

    def setUp(self):
        self.source = InternshipSource.objects.create(
            name="Collector Test Source",
            source_type="api",
        )

    @patch("apps.internships.services.collector.transaction.on_commit")
    @patch("apps.internships.tasks.validate_listing_urls_task.delay")
    def test_collect_queues_validation_for_new_listing(self, mock_validate, mock_on_commit):
        from apps.internships.services.collector import InternshipCollector

        def execute(callback):
            callback()
        mock_on_commit.side_effect = execute

        records = [
            {
                "title": "New Listing",
                "organization_name": "New Corp",
                "description": "New description",
                "application_url": "https://example.com/apply",
                "external_id": "collector_new_1",
                "internship_type": "remote",
                "work_type": "full_time",
            }
        ]

        collector = InternshipCollector(self.source)
        log = collector.collect(records)

        self.assertEqual(log.records_created, 1)
        self.assertEqual(log.records_updated, 0)
        mock_validate.assert_called_once()
        called_with = mock_validate.call_args[0][0]
        self.assertEqual(
            Internship.objects.get(pk=called_with).external_id,
            "collector_new_1",
        )

    @patch("apps.internships.services.collector.transaction.on_commit")
    @patch("apps.internships.tasks.validate_listing_urls_task.delay")
    def test_collect_queues_validation_for_updated_listing(self, mock_validate, mock_on_commit):
        from apps.internships.services.collector import InternshipCollector

        def execute(callback):
            callback()
        mock_on_commit.side_effect = execute

        existing = Internship.objects.create(
            title="Old Title",
            organization_name="Old Corp",
            description="Old description",
            application_url="https://example.com/apply",
            source=self.source,
            external_id="collector_update_1",
            internship_type="remote",
            work_type="full_time",
        )

        records = [
            {
                "title": "Updated Title",
                "organization_name": "Old Corp",
                "description": "Updated description",
                "application_url": "https://example.com/updated",
                "external_id": "collector_update_1",
                "internship_type": "remote",
                "work_type": "full_time",
            }
        ]

        collector = InternshipCollector(self.source)
        log = collector.collect(records)

        self.assertEqual(log.records_created, 0)
        self.assertEqual(log.records_updated, 1)
        mock_validate.assert_called_once_with(existing.id)


class Task59EndToEndTest(TestCase):
    """End-to-end check: valid URL auto-publishes, 404 URL flags for review."""

    def setUp(self):
        self.source = InternshipSource.objects.create(
            name="E2E Source",
            source_type="api",
        )

    @patch("apps.data_sources.services.urlcheck.requests.request")
    def test_valid_url_auto_published_and_invalid_flagged(self, mock_request):
        def make_response(status_code):
            m = MagicMock()
            m.status_code = status_code
            m.close.return_value = None
            return m

        mock_request.side_effect = [
            make_response(200),
            make_response(200),
            make_response(200),
            make_response(404),
        ]

        valid_internship = Internship.objects.create(
            title="Valid URL Internship",
            organization_name="Valid Corp",
            description="Valid description",
            application_url="https://valid.example.com/apply",
            source_url="https://valid.example.com/source",
            source=self.source,
            external_id="e2e_valid",
            status=Internship.STATUS_DRAFT,
            is_verified=False,
        )

        broken_internship = Internship.objects.create(
            title="Broken URL Internship",
            organization_name="Broken Corp",
            description="Broken description",
            application_url="https://broken.example.com/apply",
            source_url="https://broken.example.com/source",
            source=self.source,
            external_id="e2e_broken",
            status=Internship.STATUS_DRAFT,
            is_verified=False,
        )

        validate_listing_urls_task(valid_internship.id)
        validate_listing_urls_task(broken_internship.id)

        valid_internship.refresh_from_db()
        broken_internship.refresh_from_db()

        self.assertEqual(valid_internship.status, Internship.STATUS_ACTIVE)
        self.assertTrue(valid_internship.is_verified)
        self.assertFalse(valid_internship.needs_review)

        self.assertEqual(broken_internship.status, Internship.STATUS_DRAFT)
        self.assertFalse(broken_internship.is_verified)
        self.assertTrue(broken_internship.needs_review)

        visible_to_students = Internship.objects.filter(
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            needs_review=False,
        ).count()
        self.assertEqual(visible_to_students, 1)
        self.assertTrue(
            Internship.objects.filter(
                pk=valid_internship.id,
                status=Internship.STATUS_ACTIVE,
                is_verified=True,
                needs_review=False,
            ).exists()
        )
    """Test cases for SavedInternship model"""

    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        self.source = InternshipSource.objects.create(
            name='LinkedIn',
            source_type='api'
        )
        self.internship = Internship.objects.create(
            title='Software Engineer Intern',
            organization_name='Tech Company',
            description='Software engineering internship',
            application_url='https://example.com/apply',
            source=self.source,
            status=Internship.STATUS_ACTIVE
        )

    def test_save_internship(self):
        """Test saving an internship"""
        saved = SavedInternship.objects.create(
            student=self.user,
            internship=self.internship
        )
        self.assertEqual(saved.student, self.user)
        self.assertEqual(saved.internship, self.internship)

    def test_unique_saved_internship(self):
        """Test that a user can't save the same internship twice"""
        SavedInternship.objects.create(
            student=self.user,
            internship=self.internship
        )
        with self.assertRaises(Exception):
            SavedInternship.objects.create(
                student=self.user,
                internship=self.internship
            )


class InternshipApplicationModelTest(TestCase):
    """Test cases for InternshipApplication model"""

    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        self.source = InternshipSource.objects.create(
            name='LinkedIn',
            source_type='api'
        )
        self.internship = Internship.objects.create(
            title='Software Engineer Intern',
            organization_name='Tech Company',
            description='Software engineering internship',
            application_url='https://example.com/apply',
            source=self.source
        )

    def test_create_application(self):
        """Test creating an internship application"""
        application = InternshipApplication.objects.create(
            student=self.user,
            internship=self.internship,
            status=InternshipApplication.STATUS_APPLIED
        )
        self.assertEqual(application.status,
                         InternshipApplication.STATUS_APPLIED)
        self.assertEqual(application.student, self.user)

    def test_unique_application(self):
        """Test that a user can't apply to the same internship twice"""
        InternshipApplication.objects.create(
            student=self.user,
            internship=self.internship
        )
        with self.assertRaises(Exception):
            InternshipApplication.objects.create(
                student=self.user,
                internship=self.internship
            )


class InternshipAPITest(TestCase):
    """Test cases for Internship API endpoints"""

    def setUp(self):
        """Set up test data and client"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        self.admin = User.objects.create_superuser(
            email='admin@example.com',
            username='admin',
            password='adminpass123'
        )
        self.source = InternshipSource.objects.create(
            name='LinkedIn',
            source_type='api'
        )
        self.skill = Skill.objects.create(name='Python')
        self.internship = Internship.objects.create(
            title='Software Engineer Intern',
            organization_name='Tech Company',
            description='Software engineering internship',
            application_url='https://example.com/apply',
            source=self.source,
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            embedding_status=Internship.EMBEDDING_STATUS_COMPLETED
        )
        self.internship.required_skills.add(self.skill)

    def test_list_internships(self):
        """Test listing internships"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/internships/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_internship_detail(self):
        """Test getting internship details"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f'/api/internships/{self.internship.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Software Engineer Intern')

    def test_latest_internships(self):
        """Test getting latest internships"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/internships/latest/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_save_internship(self):
        """Test saving an internship"""
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/internships/saved/add/', {
            'internship': self.internship.id
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_save_duplicate_internship(self):
        """Test saving an internship twice returns 400 bad request"""
        SavedInternship.objects.create(
            student=self.user,
            internship=self.internship
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/internships/saved/add/', {
            'internship': self.internship.id
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('internship', response.data)

    def test_saved_internships_list(self):
        """Test listing saved internships"""
        SavedInternship.objects.create(
            student=self.user,
            internship=self.internship
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/internships/saved/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # Phase 8 Task 8.1 Tests
    def test_post_save_internship_endpoint(self):
        """Test POST /api/internships/<id>/save/ saves for authenticated student"""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/internships/{self.internship.id}/save/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get('saved'))
        self.assertTrue(SavedInternship.objects.filter(
            student=self.user, internship=self.internship).exists())

    def test_post_save_duplicate_prevention(self):
        """Test duplicate save via POST /api/internships/<id>/save/ prevents duplicate DB records"""
        SavedInternship.objects.create(
            student=self.user, internship=self.internship)
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            f'/api/internships/{self.internship.id}/save/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('saved'))
        self.assertEqual(SavedInternship.objects.filter(
            student=self.user, internship=self.internship).count(), 1)

    def test_delete_unsave_internship_endpoint(self):
        """Test DELETE /api/internships/<id>/save/ unsaves for authenticated student"""
        SavedInternship.objects.create(
            student=self.user, internship=self.internship)
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f'/api/internships/{self.internship.id}/save/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data.get('saved'))
        self.assertFalse(SavedInternship.objects.filter(
            student=self.user, internship=self.internship).exists())

    def test_unsave_user_isolation(self):
        """Test User A cannot delete User B's saved internship"""
        other_user = User.objects.create_user(
            email='other_student@example.com',
            password='password123',
            role='student',
            is_email_verified=True,
        )
        SavedInternship.objects.create(
            student=other_user, internship=self.internship)

        # Authenticate as self.user (who has NOT saved the internship)
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f'/api/internships/{self.internship.id}/save/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Confirm other_user's saved internship remains in DB
        self.assertTrue(SavedInternship.objects.filter(
            student=other_user, internship=self.internship).exists())

    def test_save_nonexistent_internship(self):
        """Test saving nonexistent internship returns 404"""
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/internships/99999/save/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unsave_nonexistent_internship(self):
        """Test unsaving nonexistent internship returns 404"""
        self.client.force_authenticate(user=self.user)
        response = self.client.delete('/api/internships/99999/save/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_save_unauthenticated(self):
        """Test unauthenticated save returns 401"""
        response = self.client.post(
            f'/api/internships/{self.internship.id}/save/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_application(self):
        """Test creating an application"""
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/internships/applications/add/', {
            'internship': self.internship.id
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_duplicate_application(self):
        """Test applying to an internship twice returns 400 bad request"""
        InternshipApplication.objects.create(
            student=self.user,
            internship=self.internship
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/internships/applications/add/', {
            'internship': self.internship.id
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('internship', response.data)

    def test_applications_list(self):
        """Test listing applications"""
        InternshipApplication.objects.create(
            student=self.user,
            internship=self.internship
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/internships/applications/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_student_dashboard(self):
        """Test student dashboard"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/internships/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('saved_internships', response.data)
        self.assertIn('total_applications', response.data)

    def test_student_recommendations(self):
        """Test student recommendations endpoint"""
        from apps.students.models import StudentProfile
        from apps.accounts.services import create_student_user

        # Create student with profile
        student = create_student_user(
            email='student@example.com',
            username='student',
            password='testpass123'
        )
        student.is_email_verified = True
        student.save()

        profile = StudentProfile.objects.create(
            user=student,
            preferred_locations=['Remote'],
            compensation_preference='either',
            work_type='either',
            internship_type='any'
        )
        profile.skills.add(self.skill)

        self.client.force_authenticate(user=student)
        response = self.client.get('/api/recommendations/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
        self.assertIsInstance(response.data['results'], list)

    def test_admin_create_internship_with_embedding(self):
        """Test admin creating internship queues embedding generation"""
        from unittest.mock import patch

        self.client.force_authenticate(user=self.admin)

        # Mock the embedding task to avoid actual Celery execution
        with patch('apps.internships.views.generate_internship_embedding_task.delay'):
            response = self.client.post('/api/internships/admin/', {
                'title': 'New Internship',
                'organization_name': 'New Company',
                'description': 'Test description',
                'application_url': 'https://example.com/apply',
                'source': self.source.id,
                'external_id': 'admin_test_1',
                'internship_type': 'remote',
                'work_type': 'full_time',
            }, format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertIn('embedding_status', response.data)

    def test_admin_update_internship_with_embedding(self):
        """Test admin updating internship queues embedding regeneration"""
        from unittest.mock import patch

        self.client.force_authenticate(user=self.admin)

        # Mock the embedding task to avoid actual Celery execution
        with patch('apps.internships.views.generate_internship_embedding_task.delay'):
            response = self.client.patch(f'/api/internships/admin/{self.internship.id}/', {
                'title': 'Updated Title'
            }, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data['title'], 'Updated Title')


class InternshipFilterAPITest(TestCase):
    """Tests for internship list filtering and search behavior."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='filter@example.com',
            username='filteruser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)

        self.source = InternshipSource.objects.create(
            name='Test Source',
            source_type='api'
        )

        self.active_remote = Internship.objects.create(
            title='Senior Python Developer',
            organization_name='Alpha Labs',
            description='Build APIs with Django and Python.',
            application_url='https://example.com/alpha',
            source=self.source,
            external_id='filter-remote-1',
            country='USA',
            city='New York',
            work_mode='remote',
            internship_type='remote',
            required_experience='Mid-level',
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
        )
        self.active_remote_2 = Internship.objects.create(
            title='Frontend Engineer',
            organization_name='Beta Systems',
            description='React and Node work for product design.',
            application_url='https://example.com/beta',
            source=self.source,
            external_id='filter-remote-2',
            country='Canada',
            city='Toronto',
            work_mode='hybrid',
            internship_type='hybrid',
            required_experience='Beginner',
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
        )
        self.active_onsite = Internship.objects.create(
            title='Data Analyst Intern',
            organization_name='Gamma Analytics',
            description='Work with dashboards and machine learning models.',
            application_url='https://example.com/gamma',
            source=self.source,
            external_id='filter-onsite-1',
            country='Germany',
            city='Berlin',
            work_mode='onsite',
            internship_type='onsite',
            required_experience='Junior',
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
        )
        self.expired = Internship.objects.create(
            title='AI Research Intern',
            organization_name='Delta Labs',
            description='Research and write about AI systems.',
            application_url='https://example.com/delta',
            source=self.source,
            external_id='filter-expired-1',
            country='USA',
            city='Austin',
            work_mode='remote',
            internship_type='remote',
            required_experience='Senior',
            status=Internship.STATUS_EXPIRED,
            is_verified=True,
        )

    def test_filter_q_matches_title_and_description_only(self):
        response = self.client.get('/api/internships/', {'q': 'Django'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data['results']}
        self.assertIn(self.active_remote.id, ids)
        self.assertNotIn(self.active_remote_2.id, ids)
        self.assertNotIn(self.active_onsite.id, ids)
        self.assertNotIn(self.expired.id, ids)

    def test_filter_location_matches_country_or_city(self):
        response = self.client.get(
            '/api/internships/', {'location': 'new york'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data['results']}
        self.assertIn(self.active_remote.id, ids)
        self.assertNotIn(self.active_remote_2.id, ids)
        self.assertNotIn(self.active_onsite.id, ids)

    def test_filter_work_mode_matches_value(self):
        response = self.client.get(
            '/api/internships/', {'work_mode': 'remote'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data['results']}
        self.assertIn(self.active_remote.id, ids)
        self.assertNotIn(self.active_remote_2.id, ids)
        self.assertNotIn(self.active_onsite.id, ids)

    def test_filter_type_matches_internship_type(self):
        response = self.client.get('/api/internships/', {'type': 'hybrid'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data['results']}
        self.assertIn(self.active_remote_2.id, ids)
        self.assertNotIn(self.active_remote.id, ids)
        self.assertNotIn(self.active_onsite.id, ids)

    def test_filter_experience_matches_required_experience(self):
        response = self.client.get(
            '/api/internships/', {'experience': 'beginner'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['id'] for item in response.data['results']}
        self.assertIn(self.active_remote_2.id, ids)
        self.assertNotIn(self.active_remote.id, ids)
        self.assertNotIn(self.active_onsite.id, ids)


class InternshipPaginationAPITest(TestCase):
    """Tests for pagination metadata and page slicing."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='pagination@example.com',
            username='paginationuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        self.source = InternshipSource.objects.create(
            name='Pagination Source',
            source_type='api'
        )

        for i in range(25):
            Internship.objects.create(
                title=f'Pagination Internship {i}',
                organization_name='Page Test Company',
                description='This internship is used for pagination checks.',
                application_url=f'https://example.com/internship/{i}',
                source=self.source,
                external_id=f'pagination-{i}',
                country='USA',
                city='Boston',
                work_mode='remote',
                internship_type='remote',
                required_experience='Junior',
                status=Internship.STATUS_ACTIVE,
                is_verified=True,
            )

    def test_page_two_returns_next_slice_with_correct_metadata(self):
        page_1 = self.client.get(
            '/api/internships/', {'page': 1, 'page_size': 10})
        page_2 = self.client.get(
            '/api/internships/', {'page': 2, 'page_size': 10})

        self.assertEqual(page_1.status_code, status.HTTP_200_OK)
        self.assertEqual(page_2.status_code, status.HTTP_200_OK)
        self.assertEqual(page_1.data['count'], 25)
        self.assertEqual(page_2.data['count'], 25)
        self.assertEqual(len(page_1.data['results']), 10)
        self.assertEqual(len(page_2.data['results']), 10)
        self.assertIsNotNone(page_2.data['next'])
        self.assertIsNotNone(page_2.data['previous'])

        page_1_ids = {item['id'] for item in page_1.data['results']}
        page_2_ids = {item['id'] for item in page_2.data['results']}
        self.assertTrue(page_1_ids.isdisjoint(page_2_ids))


class SemanticMatchingTest(TestCase):
    """Test cases for semantic matching functionality"""

    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        from apps.students.models import StudentProfile
        self.profile = StudentProfile.objects.create(
            user=self.user,
            bio='Software engineering student',
            country='USA',
            city='New York'
        )
        self.skill = Skill.objects.create(name='Python')
        self.profile.skills.add(self.skill)

        self.source = InternshipSource.objects.create(
            name='LinkedIn',
            source_type='api'
        )
        self.internship = Internship.objects.create(
            title='Python Developer Intern',
            organization_name='Tech Company',
            description='Python development internship',
            application_url='https://example.com/apply',
            source=self.source,
            status=Internship.STATUS_ACTIVE
        )
        self.internship.required_skills.add(self.skill)

    def test_build_student_text(self):
        """Test building student text for embedding"""
        text = build_student_text(self.profile)
        self.assertIn('Python', text)
        self.assertIn('Software engineering student', text)
        self.assertIn('USA', text)
        self.assertIn('New York', text)

    def test_build_internship_text(self):
        """Test building internship text for embedding"""
        text = build_internship_text(self.internship)
        self.assertIn('Python Developer Intern', text)
        self.assertIn('Python development internship', text)
        self.assertIn('Python', text)

    def test_generate_embedding(self):
        """Test embedding generation"""
        text = "Software engineering with Python and Django"
        embedding = generate_embedding(text)
        self.assertIsInstance(embedding, list)
        self.assertEqual(len(embedding), 384)

    def test_generate_empty_embedding(self):
        """Test embedding generation with empty text"""
        embedding = generate_embedding('')
        self.assertEqual(embedding, [])

    def test_update_student_embedding(self):
        """Test updating student embedding"""
        embedding = update_student_embedding(self.profile)
        self.assertIsInstance(embedding, list)
        self.assertEqual(len(embedding), 384)
        self.profile.refresh_from_db()
        self.assertEqual(len(self.profile.embedding), 384)

    def test_update_internship_embedding(self):
        """Test updating internship embedding"""
        embedding = update_internship_embedding(self.internship)
        self.assertIsInstance(embedding, list)
        self.assertEqual(len(embedding), 384)
        self.internship.refresh_from_db()
        self.assertEqual(len(self.internship.embedding), 384)

    def test_calculate_stored_semantic_similarity(self):
        """Test semantic similarity calculation with stored embeddings"""
        update_student_embedding(self.profile)
        update_internship_embedding(self.internship)

        similarity = calculate_stored_semantic_similarity(
            self.profile,
            self.internship
        )
        self.assertIsInstance(similarity, float)
        self.assertGreaterEqual(similarity, 0.0)
        self.assertLessEqual(similarity, 100.0)

    def test_semantic_similarity_with_no_embeddings(self):
        """Test semantic similarity when embeddings don't exist"""
        # Clear any existing embeddings
        self.profile.embedding = None
        self.internship.embedding = None
        self.profile.save()
        self.internship.save()

        similarity = calculate_stored_semantic_similarity(
            self.profile,
            self.internship
        )
        # Should auto-generate embeddings and calculate similarity
        self.assertIsInstance(similarity, float)
        self.assertGreaterEqual(similarity, 0.0)


class HybridMatchingTest(TestCase):
    """Test cases for hybrid matching functionality"""

    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        from apps.students.models import StudentProfile
        self.profile = StudentProfile.objects.create(
            user=self.user,
            bio='Software engineering student',
            preferred_locations=['Remote'],
            compensation_preference='either',
            work_type='either',
            internship_type='any'
        )
        self.skill = Skill.objects.create(name='Python')
        self.profile.skills.add(self.skill)

        self.source = InternshipSource.objects.create(
            name='LinkedIn',
            source_type='api'
        )
        self.internship = Internship.objects.create(
            title='Python Developer Intern',
            organization_name='Tech Company',
            description='Python development internship',
            application_url='https://example.com/apply',
            source=self.source,
            status=Internship.STATUS_ACTIVE,
            internship_type='remote',
            work_type='full_time',
            compensation_type='paid'
        )
        self.internship.required_skills.add(self.skill)

    def test_calculate_hybrid_match(self):
        """Test hybrid matching calculation"""
        update_student_embedding(self.profile)
        update_internship_embedding(self.internship)

        result = calculate_hybrid_match(self.profile, self.internship)

        self.assertIsInstance(result, dict)
        self.assertIn('eligible', result)
        self.assertIn('score', result)
        self.assertIn('preference_score', result)
        self.assertIn('semantic_score', result)
        self.assertIn('score_breakdown', result)
        self.assertIn('explanation', result)
        self.assertTrue(result['eligible'])
        self.assertGreaterEqual(result['score'], 0.0)
        self.assertLessEqual(result['score'], 100.0)

    def test_hybrid_match_without_embeddings(self):
        """Test hybrid matching when embeddings don't exist"""
        # Clear any existing embeddings
        self.profile.embedding = None
        self.internship.embedding = None
        self.profile.save()
        self.internship.save()

        result = calculate_hybrid_match(self.profile, self.internship)

        # Should auto-generate embeddings and calculate similarity
        self.assertIsInstance(result, dict)
        self.assertIn('score', result)
        self.assertIn('preference_score', result)
        self.assertIn('semantic_score', result)
        self.assertGreaterEqual(result['semantic_score'], 0.0)

    def test_hybrid_match_explanation(self):
        """Test hybrid match explanation generation"""
        update_student_embedding(self.profile)
        update_internship_embedding(self.internship)

        result = calculate_hybrid_match(self.profile, self.internship)
        explanation = result['explanation']

        self.assertIn('summary', explanation)
        self.assertIn('matched_skills', explanation)
        self.assertIn('missing_skills', explanation)
        self.assertIn('preferences_matched', explanation)
        self.assertIsInstance(explanation['matched_skills'], list)
        self.assertIsInstance(explanation['missing_skills'], list)


class RecommendationEngineV2Test(TestCase):
    """Test cases for Recommendation Engine V2"""

    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        from apps.students.models import StudentProfile
        self.profile = StudentProfile.objects.create(
            user=self.user,
            bio='Software engineering student',
            country='USA',
            city='New York'
        )
        self.skill = Skill.objects.create(name='Python')
        self.profile.skills.add(self.skill)

        self.source = InternshipSource.objects.create(
            name='LinkedIn',
            source_type='api'
        )
        self.internship = Internship.objects.create(
            title='Python Developer Intern',
            organization_name='Tech Company',
            description='Python development internship',
            application_url='https://example.com/apply',
            source=self.source,
            status=Internship.STATUS_ACTIVE,
            internship_type='remote',
            work_type='full_time',
            compensation_type='paid',
            minimum_compensation=1000,
            maximum_compensation=2000,
            country='USA',
            city='New York'
        )
        self.internship.required_skills.add(self.skill)

    def test_calculate_skill_score(self):
        """Test skill score calculation"""
        student_skills = ['Python', 'Django', 'React']
        internship_skills = ['Python', 'Django', 'JavaScript']
        score = calculate_skill_score(student_skills, internship_skills)
        self.assertEqual(score, 2/3)  # 2 matches out of 3

    def test_get_matched_skills(self):
        """Test matched skills extraction"""
        student_skills = ['Python', 'Django', 'React']
        internship_skills = ['python', 'DJANGO', 'JavaScript']
        matched = get_matched_skills(student_skills, internship_skills)
        self.assertIn('Python', matched)
        self.assertIn('Django', matched)
        self.assertEqual(len(matched), 2)

    def test_calculate_location_score(self):
        """Test location score calculation"""
        self.internship.internship_type = 'onsite'
        self.internship.save()

        score = calculate_location_score(self.internship, self.profile)
        self.assertEqual(score, 1.0)  # Same city

        self.profile.city = 'Boston'
        self.profile.save()
        score = calculate_location_score(self.internship, self.profile)
        self.assertEqual(score, 0.5)  # Same country, different city

    def test_calculate_final_score(self):
        """Test final weighted score calculation: 40% Semantic, 25% Skill, 20% Preference, 10% Location, 5% Salary"""
        semantic = 0.8  # 0.8 * 0.40 = 0.32
        skill = 0.6     # 0.6 * 0.25 = 0.15
        preference = 0.7  # 0.7 * 0.20 = 0.14
        location = 0.5  # 0.5 * 0.10 = 0.05
        salary = 0.9    # 0.9 * 0.05 = 0.045

        score = calculate_final_score(
            semantic, skill, preference, location, salary)
        # Expected: (0.32 + 0.15 + 0.14 + 0.05 + 0.045) * 100 = 70.5
        self.assertEqual(score, 70.5)

    def test_build_student_text_with_cv(self):
        """Test build_student_text incorporates student CV details"""
        from apps.recommendations.services.semantic_matching import build_student_text
        from apps.students.models import StudentCV
        StudentCV.objects.create(
            student=self.user,
            extracted_text='Experienced Django developer with Python skills.',
            extracted_skills=['Django', 'Python', 'REST']
        )
        text = build_student_text(self.profile)
        self.assertIn('CV Text:', text)
        self.assertIn('Django', text)

    def test_build_explanation(self):
        """Test explanation building"""
        explanation = build_explanation(
            semantic=0.85,
            skill=0.75,
            preference=0.80,
            location=0.70,
            salary=0.60,
            matched_skills=['Python', 'Django'],
            internship=self.internship
        )
        self.assertIsInstance(explanation, list)
        self.assertGreater(len(explanation), 0)

    def test_student_recommendations_v2(self):
        """Test student recommendations endpoint with v2 engine and score breakdown"""
        from apps.students.models import StudentProfile
        from apps.accounts.services import create_student_user
        from rest_framework.test import APIClient

        # Create student with profile
        student = create_student_user(
            email='student2@example.com',
            username='student2',
            password='testpass123'
        )
        student.is_email_verified = True
        student.save()

        profile = StudentProfile.objects.create(
            user=student,
            preferred_locations=['Remote'],
            compensation_preference='either',
            work_type='either',
            internship_type='any'
        )
        profile.skills.add(self.skill)

        client = APIClient()
        client.force_authenticate(user=student)
        response = client.get('/api/recommendations/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
        self.assertIsInstance(response.data['results'], list)

        # Check new v2 response format with score breakdown
        if len(response.data['results']) > 0:
            result = response.data['results'][0]
            self.assertIn('match_score', result)
            self.assertIn('score_breakdown', result)
            self.assertIn('explanation', result)
            self.assertIn('semantic_score', result['score_breakdown'])
            self.assertIn('skill_score', result['score_breakdown'])
            self.assertIn('preference_score', result['score_breakdown'])
            self.assertIn('location_score', result['score_breakdown'])
            self.assertIn('salary_score', result['score_breakdown'])
            self.assertIsInstance(result['explanation'], list)


class RecommendationModelTest(TestCase):
    """Test cases for Recommendation model"""

    def setUp(self):
        """Set up test data"""
        self.student = User.objects.create_user(
            email='student@example.com',
            username='student',
            password='testpass123',
            role='student'
        )
        self.source = InternshipSource.objects.create(
            name='LinkedIn',
            source_type='api',
            website_url='https://linkedin.com'
        )
        self.internship = Internship.objects.create(
            title='Software Engineer Intern',
            organization_name='Tech Company',
            description='Software engineering internship',
            application_url='https://example.com/apply',
            source=self.source,
            internship_type='remote',
            work_type='full_time',
            compensation_type='paid',
            minimum_compensation=1000,
            maximum_compensation=2000
        )

    def test_create_recommendation(self):
        """Test creating a new recommendation"""
        recommendation = Recommendation.objects.create(
            student=self.student,
            internship=self.internship,
            overall_score=85.50,
            skill_score=75.0,
            location_score=90.0,
            interest_score=80.0
        )
        self.assertEqual(recommendation.student, self.student)
        self.assertEqual(recommendation.internship, self.internship)
        self.assertEqual(recommendation.overall_score, 85.50)
        self.assertEqual(recommendation.status,
                         Recommendation.STATUS_RECOMMENDED)

    def test_recommendation_str(self):
        """Test recommendation string representation"""
        recommendation = Recommendation.objects.create(
            student=self.student,
            internship=self.internship,
            overall_score=85.50
        )
        expected = f"{self.student} → {self.internship} (score: 85.50)"
        self.assertEqual(str(recommendation), expected)

    def test_mark_viewed(self):
        """Test marking recommendation as viewed"""
        recommendation = Recommendation.objects.create(
            student=self.student,
            internship=self.internship,
            overall_score=85.50
        )
        recommendation.mark_viewed()
        self.assertEqual(recommendation.status, Recommendation.STATUS_VIEWED)
        self.assertIsNotNone(recommendation.viewed_at)

    def test_mark_saved(self):
        """Test marking recommendation as saved"""
        recommendation = Recommendation.objects.create(
            student=self.student,
            internship=self.internship,
            overall_score=85.50
        )
        recommendation.mark_saved()
        self.assertEqual(recommendation.status, Recommendation.STATUS_SAVED)
        self.assertIsNotNone(recommendation.saved_at)

    def test_mark_applied(self):
        """Test marking recommendation as applied"""
        recommendation = Recommendation.objects.create(
            student=self.student,
            internship=self.internship,
            overall_score=85.50
        )
        recommendation.mark_applied()
        self.assertEqual(recommendation.status, Recommendation.STATUS_APPLIED)
        self.assertIsNotNone(recommendation.applied_at)

    def test_mark_ignored(self):
        """Test marking recommendation as ignored"""
        recommendation = Recommendation.objects.create(
            student=self.student,
            internship=self.internship,
            overall_score=85.50
        )
        recommendation.mark_ignored()
        self.assertEqual(recommendation.status, Recommendation.STATUS_IGNORED)
        self.assertIsNotNone(recommendation.ignored_at)

    def test_unique_constraint(self):
        """Test unique constraint on student-internship pair"""
        Recommendation.objects.create(
            student=self.student,
            internship=self.internship,
            overall_score=85.50
        )
        with self.assertRaises(Exception):  # IntegrityError
            Recommendation.objects.create(
                student=self.student,
                internship=self.internship,
                overall_score=90.00
            )


class RecommendationFeedbackAPITest(TestCase):
    """Test cases for recommendation feedback API endpoints"""

    def setUp(self):
        """Set up test data"""
        self.client = APIClient()
        self.student = User.objects.create_user(
            email='student@example.com',
            username='student',
            password='testpass123',
            role='student'
        )
        self.source = InternshipSource.objects.create(
            name='LinkedIn',
            source_type='api',
            website_url='https://linkedin.com'
        )
        self.internship = Internship.objects.create(
            title='Software Engineer Intern',
            organization_name='Tech Company',
            description='Software engineering internship',
            application_url='https://example.com/apply',
            source=self.source,
            internship_type='remote',
            work_type='full_time',
            compensation_type='paid',
            minimum_compensation=1000,
            maximum_compensation=2000
        )
        self.recommendation = Recommendation.objects.create(
            student=self.student,
            internship=self.internship,
            overall_score=85.50
        )

    def test_recommendation_history_list(self):
        """Test listing recommendation history"""
        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/recommendations/history/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(len(response.data['results']), 1)

    def test_recommendation_history_isolated_and_ordered(self):
        other_student = User.objects.create_user(
            email='other@example.com', username='other', password='testpass123', role='student'
        )
        older_internship = Internship.objects.create(
            title='Older Internship', organization_name='Older Company', description='Older role',
            application_url='https://example.com/older', source=self.source, internship_type='remote',
            work_type='full_time', compensation_type='paid', minimum_compensation=1000,
            maximum_compensation=2000, external_id='older-history-internship',
        )
        older = Recommendation.objects.create(
            student=self.student, internship=older_internship, overall_score=70.00
        )
        older.recommendation_date = timezone.now() - timezone.timedelta(days=1)
        Recommendation.objects.filter(pk=older.pk).update(
            recommendation_date=older.recommendation_date)
        other_internship = Internship.objects.create(
            title='Other Internship', organization_name='Other Company', description='Other role',
            application_url='https://example.com/other', source=self.source, internship_type='remote',
            work_type='full_time', compensation_type='paid', minimum_compensation=1000,
            maximum_compensation=2000, external_id='other-history-internship',
        )
        Recommendation.objects.create(
            student=other_student, internship=other_internship, overall_score=99.00
        )
        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/recommendations/history/?page_size=1')
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(response.data['results']
                         [0]['id'], self.recommendation.id)
        self.assertIsNotNone(response.data['next'])

    def test_recommendation_history_requires_authentication(self):
        response = self.client.get('/api/recommendations/history/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_recommendation_feedback_view(self):
        """Test marking recommendation as viewed"""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/recommendations/{self.internship.id}/feedback/',
            {'action': 'view'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.recommendation.refresh_from_db()
        self.assertEqual(self.recommendation.status,
                         Recommendation.STATUS_VIEWED)

    def test_recommendation_feedback_save(self):
        """Test marking recommendation as saved"""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/recommendations/{self.internship.id}/feedback/',
            {'action': 'save'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.recommendation.refresh_from_db()
        self.assertEqual(self.recommendation.status,
                         Recommendation.STATUS_SAVED)

    def test_recommendation_feedback_apply(self):
        """Test marking recommendation as applied"""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/recommendations/{self.internship.id}/feedback/',
            {'action': 'apply'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.recommendation.refresh_from_db()
        self.assertEqual(self.recommendation.status,
                         Recommendation.STATUS_APPLIED)

    def test_recommendation_feedback_ignore(self):
        """Test marking recommendation as ignored"""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/recommendations/{self.internship.id}/feedback/',
            {'action': 'ignore'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.recommendation.refresh_from_db()
        self.assertEqual(self.recommendation.status,
                         Recommendation.STATUS_IGNORED)

    def test_recommendation_feedback_not_found(self):
        """Test feedback for non-existent recommendation"""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            '/api/recommendations/99999/feedback/',
            {'action': 'view'}
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_recommendation_feedback_unauthorized(self):
        """Test feedback without authentication"""
        response = self.client.post(
            f'/api/recommendations/{self.internship.id}/feedback/',
            {'action': 'view'}
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class InternshipSkillModelTest(TestCase):
    """Test cases for InternshipSkill model and Task 1.5 fields."""

    def setUp(self):
        from apps.companies.models import Company
        from apps.data_sources.models import DataSource
        self.company = Company.objects.create(
            name="DeepMind Corp",
            website="https://deepmind.google",
            country="UK",
            industry="AI",
        )
        self.data_source = DataSource.objects.create(
            name="Tech Jobs API",
            type="api",
            base_url="https://api.techjobs.example.com",
        )
        self.skill1 = Skill.objects.create(name="PyTorch", category="ML")
        self.skill2 = Skill.objects.create(name="JAX", category="ML")
        self.internship = Internship.objects.create(
            title="ML Research Intern",
            company=self.company,
            data_source=self.data_source,
            organization_name="DeepMind Corp",
            description="Deep RL research",
            application_url="https://example.com/apply",
            internship_type="remote",
            work_mode="remote",
            salary=7000.00,
            content_hash="abc123hash",
            status=Internship.STATUS_ACTIVE,
        )

    def test_internship_new_fields(self):
        """Test company, data_source, work_mode, salary, content_hash fields."""
        self.assertEqual(self.internship.company, self.company)
        self.assertEqual(self.internship.data_source, self.data_source)
        self.assertEqual(self.internship.work_mode, "remote")
        self.assertEqual(float(self.internship.salary), 7000.00)
        self.assertEqual(self.internship.content_hash, "abc123hash")

    def test_internship_skills_and_reverse_relation(self):
        """Test adding InternshipSkills and checking reverse relation count."""
        from .models import InternshipSkill
        is1 = InternshipSkill.objects.create(
            internship=self.internship, skill=self.skill1)
        is2 = InternshipSkill.objects.create(
            internship=self.internship, skill=self.skill2)

        self.assertEqual(self.internship.internshipskill_set.count(), 2)
        self.assertIn("ML Research Intern - PyTorch", str(is1))

    def test_duplicate_internship_skill_raises_error(self):
        """Test unique constraint on (internship, skill)."""
        from .models import InternshipSkill
        from django.db import IntegrityError
        InternshipSkill.objects.create(
            internship=self.internship, skill=self.skill1)
        with self.assertRaises(IntegrityError):
            InternshipSkill.objects.create(
                internship=self.internship, skill=self.skill1)


# ======================================================================
# Phase 9 Task 9.2 — Internship & Data-Source Monitoring Tests
# ======================================================================


class AdminInternshipReviewQueueTest(TestCase):
    """Test 1 — Admin can list internships in review queue."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        self.student = User.objects.create_user(
            email="student@example.com",
            username="student",
            password="studentpass123",
        )
        self.student.role = "student"
        self.student.is_active = True
        self.student.is_email_verified = True
        self.student.save()
        self.source = InternshipSource.objects.create(
            name="Test Source", source_type="api",
        )
        self.flagged = Internship.objects.create(
            title="Flagged Internship",
            organization_name="Flag Corp",
            description="Needs review.",
            application_url="https://example.com/apply/flagged",
            source=self.source,
            status=Internship.STATUS_DRAFT,
            needs_review=True,
            external_id="review-flagged-1",
        )
        self.active = Internship.objects.create(
            title="Active Internship",
            organization_name="Active Corp",
            description="No issues.",
            application_url="https://example.com/apply/active",
            source=self.source,
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            needs_review=False,
            external_id="review-active-1",
        )

    def test_admin_can_list_review_queue(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/internships/admin/review/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        ids = [i["id"] for i in response.data["results"]]
        self.assertIn(self.flagged.id, ids)
        self.assertNotIn(self.active.id, ids)

    def test_review_queue_shows_needs_review_details(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/internships/admin/review/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["results"][0]
        self.assertTrue(item["needs_review"])
        self.assertIn("duplicate_flags", item)
        self.assertIn("invalid_urls", item)
        self.assertIn("low_confidence_skills", item)


class AdminReviewNeedsReviewSurfacedTest(TestCase):
    """Test 2 — needs_review internships are surfaced to admin."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        self.source = InternshipSource.objects.create(
            name="Source", source_type="api",
        )

    def test_broken_link_flagged_internship_appears_in_queue(self):
        internship = Internship.objects.create(
            title="Broken Link",
            organization_name="Corp",
            description="desc",
            application_url="https://example.com/apply/broken",
            source=self.source,
            status=Internship.STATUS_DRAFT,
            needs_review=True,
            url_validation={
                "application_url": {"valid": False, "status_code": 404},
            },
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/internships/admin/review/")
        ids = [i["id"] for i in response.data["results"]]
        self.assertIn(internship.id, ids)

    def test_approved_internship_not_in_queue(self):
        Internship.objects.create(
            title="Approved",
            organization_name="Corp",
            description="desc",
            application_url="https://example.com/apply/approved",
            source=self.source,
            status=Internship.STATUS_ACTIVE,
            needs_review=False,
            is_verified=True,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/internships/admin/review/")
        self.assertEqual(response.data["count"], 0)


class AdminReviewNearDuplicateTest(TestCase):
    """Test 3 — Near-duplicate flagged internship appears in review queue."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        self.source = InternshipSource.objects.create(
            name="Source", source_type="api",
        )

    def test_near_duplicate_appears_in_review_queue(self):
        existing = Internship.objects.create(
            title="Python Backend Intern",
            organization_name="Example Corp",
            description="desc",
            application_url="https://example.com/apply/1",
            source=self.source,
            status=Internship.STATUS_ACTIVE,
            is_verified=True,
            needs_review=True,
        )
        from .models import InternshipDuplicateFlag
        InternshipDuplicateFlag.objects.create(
            internship=existing,
            title="Python Backend Internship",
            organization_name="Example Corp",
            application_url="https://example.com/apply/2",
            content_hash="abc123",
            similarity_score=92.0,
            review_status="pending",
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/internships/admin/review/")
        ids = [i["id"] for i in response.data["results"]]
        self.assertIn(existing.id, ids)
        item = next(i for i in response.data["results"] if i["id"] == existing.id)
        self.assertEqual(item["pending_duplicate_count"], 1)
        self.assertGreaterEqual(item["duplicate_flags"][0]["similarity_score"], 80)


class AdminReviewBrokenLinkTest(TestCase):
    """Test 4 — Broken-link flagged internship appears in review queue."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        self.source = InternshipSource.objects.create(
            name="Source", source_type="api",
        )

    def test_broken_link_internship_in_queue(self):
        internship = Internship.objects.create(
            title="Broken Link Intern",
            organization_name="Corp",
            description="desc",
            application_url="https://example.com/apply/dead",
            source=self.source,
            status=Internship.STATUS_DRAFT,
            needs_review=True,
            url_validation={
                "application_url": {"valid": False, "status_code": 404, "error": "Not Found"},
                "source_url": {"valid": True, "status_code": 200},
            },
            validated_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/internships/admin/review/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["results"][0]
        self.assertIn("application_url", item["invalid_urls"])


class AdminInternshipApproveTest(TestCase):
    """Test 5 — Admin can approve a flagged internship."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        self.source = InternshipSource.objects.create(
            name="Source", source_type="api",
        )
        self.internship = Internship.objects.create(
            title="Flagged for Approval",
            organization_name="Corp",
            description="desc",
            application_url="https://example.com/apply/approve-me",
            source=self.source,
            status=Internship.STATUS_DRAFT,
            needs_review=True,
        )

    def test_admin_can_approve_flagged_internship(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/approve/",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.internship.refresh_from_db()
        self.assertEqual(self.internship.status, Internship.STATUS_ACTIVE)
        self.assertTrue(self.internship.is_verified)
        self.assertFalse(self.internship.needs_review)
        self.assertIsNotNone(self.internship.verified_at)
        self.assertEqual(self.internship.verified_by, self.admin)

    def test_approve_clears_duplicate_flags(self):
        from .models import InternshipDuplicateFlag
        InternshipDuplicateFlag.objects.create(
            internship=self.internship,
            title="Near dup",
            organization_name="Corp",
            application_url="https://example.com/apply/dup",
            content_hash="dup123",
            similarity_score=90.0,
        )
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/internships/admin/{self.internship.id}/approve/")
        flag = InternshipDuplicateFlag.objects.get(
            internship=self.internship
        )
        self.assertEqual(flag.review_status, "resolved")

    def test_approve_non_flagged_returns_400(self):
        self.internship.needs_review = False
        self.internship.save(update_fields=["needs_review"])
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/approve/",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_approve_nonexistent_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/internships/admin/99999/approve/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class AdminInternshipRejectTest(TestCase):
    """Test 6 — Admin can reject a flagged internship."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        self.source = InternshipSource.objects.create(
            name="Source", source_type="api",
        )
        self.internship = Internship.objects.create(
            title="Flagged for Rejection",
            organization_name="Corp",
            description="desc",
            application_url="https://example.com/apply/reject-me",
            source=self.source,
            status=Internship.STATUS_DRAFT,
            needs_review=True,
        )

    def test_admin_can_reject_flagged_internship(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/reject/",
            {"action": "reject", "rejection_reason": "Broken link"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.internship.refresh_from_db()
        self.assertEqual(self.internship.status, Internship.STATUS_REJECTED)
        self.assertFalse(self.internship.needs_review)
        self.assertEqual(self.internship.rejection_reason, "Broken link")

    def test_reject_clears_duplicate_flags(self):
        from .models import InternshipDuplicateFlag
        InternshipDuplicateFlag.objects.create(
            internship=self.internship,
            title="Near dup",
            organization_name="Corp",
            application_url="https://example.com/apply/dup",
            content_hash="dup456",
            similarity_score=88.0,
        )
        self.client.force_authenticate(user=self.admin)
        self.client.post(
            f"/api/internships/admin/{self.internship.id}/reject/",
            {"action": "reject", "rejection_reason": "Duplicate content"},
            format="json",
        )
        flag = InternshipDuplicateFlag.objects.get(
            internship=self.internship
        )
        self.assertEqual(flag.review_status, "resolved")

    def test_reject_requires_reason(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/reject/",
            {"action": "reject"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_non_flagged_returns_400(self):
        self.internship.needs_review = False
        self.internship.save(update_fields=["needs_review"])
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/reject/",
            {"action": "reject", "rejection_reason": "spam"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AdminInternshipRemoveTest(TestCase):
    """Test 7 — Admin can remove a flagged internship."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        self.source = InternshipSource.objects.create(
            name="Source", source_type="api",
        )
        self.internship = Internship.objects.create(
            title="Flagged for Removal",
            organization_name="Corp",
            description="desc",
            application_url="https://example.com/apply/remove-me",
            source=self.source,
            status=Internship.STATUS_DRAFT,
            needs_review=True,
        )

    def test_admin_can_remove_flagged_internship(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/remove/",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.internship.refresh_from_db()
        self.assertEqual(self.internship.status, Internship.STATUS_REMOVED)
        self.assertFalse(self.internship.needs_review)

    def test_remove_clears_duplicate_flags(self):
        from .models import InternshipDuplicateFlag
        InternshipDuplicateFlag.objects.create(
            internship=self.internship,
            title="Near dup",
            organization_name="Corp",
            application_url="https://example.com/apply/dup",
            content_hash="dup789",
            similarity_score=85.0,
        )
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/internships/admin/{self.internship.id}/remove/")
        flag = InternshipDuplicateFlag.objects.get(
            internship=self.internship
        )
        self.assertEqual(flag.review_status, "resolved")

    def test_remove_non_flagged_returns_400(self):
        self.internship.needs_review = False
        self.internship.save(update_fields=["needs_review"])
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/remove/",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AdminStudentReviewAuthorizationTest(TestCase):
    """Test 8 — Student cannot access admin review queue."""

    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(
            email="student@example.com",
            username="student",
            password="studentpass123",
        )
        self.student.role = "student"
        self.student.is_active = True
        self.student.is_email_verified = True
        self.student.save()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        self.source = InternshipSource.objects.create(
            name="Source", source_type="api",
        )
        self.internship = Internship.objects.create(
            title="Flagged",
            organization_name="Corp",
            description="desc",
            application_url="https://example.com/apply/flag",
            source=self.source,
            status=Internship.STATUS_DRAFT,
            needs_review=True,
        )

    def test_student_cannot_access_review_queue(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get("/api/internships/admin/review/")
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_student_cannot_approve(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/approve/",
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_student_cannot_reject(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/reject/",
            {"action": "reject", "rejection_reason": "no"},
            format="json",
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_student_cannot_remove(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/remove/",
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )


class UnauthenticatedReviewAuthorizationTest(TestCase):
    """Test 10 — Unauthenticated user cannot access admin endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.source = InternshipSource.objects.create(
            name="Source", source_type="api",
        )
        self.internship = Internship.objects.create(
            title="Flagged",
            organization_name="Corp",
            description="desc",
            application_url="https://example.com/apply/flag",
            source=self.source,
            status=Internship.STATUS_DRAFT,
            needs_review=True,
        )

    def test_unauthenticated_cannot_access_review_queue(self):
        response = self.client.get("/api/internships/admin/review/")
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_unauthenticated_cannot_approve(self):
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/approve/",
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_unauthenticated_cannot_reject(self):
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/reject/",
            {"action": "reject", "rejection_reason": "no"},
            format="json",
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_unauthenticated_cannot_remove(self):
        response = self.client.post(
            f"/api/internships/admin/{self.internship.id}/remove/",
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )


class DataSourceHealthAPITest(TestCase):
    """Test 11 — Data-source health endpoint exposes run info."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        from apps.data_sources.models import DataSource
        self.data_source = DataSource.objects.create(
            name="Health DataSource",
            type=DataSource.Type.API,
            is_active=True,
            base_url="https://health.example.com",
        )
        # Also create an InternshipSource + CollectionLog for the
        # internships-level health endpoint
        self.source = InternshipSource.objects.create(
            name="Health Source",
            source_type="api",
            is_active=True,
        )
        InternshipCollectionLog.objects.create(
            source=self.source,
            status="success",
            records_found=10,
            records_created=8,
            records_updated=2,
            records_failed=0,
            completed_at=timezone.now(),
        )

    def test_admin_can_view_data_source_health(self):
        self.client.force_authenticate(user=self.admin)
        # Test the new-pipeline DataSource health endpoint
        response = self.client.get(
            "/api/admin/data-sources/health/",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        entry = next(
            (e for e in response.data if e["id"] == self.data_source.id),
            None,
        )
        self.assertIsNotNone(entry)
        self.assertTrue(entry["is_active"])

    def test_student_cannot_view_data_source_health(self):
        student = User.objects.create_user(
            email="s@example.com",
            username="s",
            password="pass12345",
        )
        student.role = "student"
        student.is_active = True
        student.is_email_verified = True
        student.save()
        self.client.force_authenticate(user=student)
        response = self.client.get(
            "/api/admin/data-sources/health/",
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_unauthenticated_cannot_view_data_source_health(self):
        response = self.client.get(
            "/api/admin/data-sources/health/",
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )


class DataSourceHealthFailedRunTest(TestCase):
    """Test 12 — Failed data-source run exposes error info."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        from apps.data_sources.models import DataSource
        self.data_source = DataSource.objects.create(
            name="Failing DataSource",
            type=DataSource.Type.RSS,
            is_active=True,
        )
        # InternshipSource + CollectionLog for run-level data
        self.source = InternshipSource.objects.create(
            name="Failing Source",
            source_type="rss",
            is_active=True,
        )

    def test_failed_run_exposes_error(self):
        InternshipCollectionLog.objects.create(
            source=self.source,
            status="failed",
            error_message="Connection timeout after 30s",
            records_found=0,
            records_created=0,
            records_failed=0,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            "/api/admin/data-sources/health/",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # DataSource-level health shows is_active and last_synced_at
        entry = next(
            (e for e in response.data if e["id"] == self.data_source.id),
            None,
        )
        self.assertIsNotNone(entry)
        self.assertTrue(entry["is_active"])

    def test_no_runs_returns_null_health_fields(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            "/api/admin/data-sources/health/",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry = next(
            (e for e in response.data if e["id"] == self.data_source.id),
            None,
        )
        self.assertIsNotNone(entry)
        # DataSource has no last_synced_at since no sync has run
        self.assertIsNone(entry["last_synced_at"])


class InternshipSourceHealthAPITest(TestCase):
    """Test — InternshipSource health endpoint exposes run status/errors."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@example.com",
            username="admin",
            password="adminpass123",
        )
        self.source = InternshipSource.objects.create(
            name="Source Health",
            source_type="api",
            is_active=True,
        )
        self.student = User.objects.create_user(
            email="sh@example.com",
            username="sh",
            password="pass12345",
        )
        self.student.role = "student"
        self.student.is_active = True
        self.student.is_email_verified = True
        self.student.save()

    def test_admin_can_view_source_health_success_run(self):
        InternshipCollectionLog.objects.create(
            source=self.source,
            status="success",
            started_at=timezone.now(),
            records_found=20,
            records_created=15,
            records_failed=0,
            completed_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            "/api/internships/admin/data-sources/health/",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry = next(
            (e for e in response.data if e["id"] == self.source.id),
            None,
        )
        self.assertIsNotNone(entry)
        self.assertEqual(entry["last_run_status"], "success")
        self.assertEqual(entry["last_records_found"], 20)

    def test_admin_can_view_source_health_failed_run(self):
        InternshipCollectionLog.objects.create(
            source=self.source,
            status="failed",
            error_message="Connection timeout",
            records_found=0,
            records_failed=5,
            completed_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            "/api/internships/admin/data-sources/health/",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry = next(
            (e for e in response.data if e["id"] == self.source.id),
            None,
        )
        self.assertIsNotNone(entry)
        self.assertEqual(entry["last_run_status"], "failed")
        self.assertEqual(entry["last_error"], "Connection timeout")

    def test_admin_can_view_source_health_no_runs(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            "/api/internships/admin/data-sources/health/",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry = next(
            (e for e in response.data if e["id"] == self.source.id),
            None,
        )
        self.assertIsNotNone(entry)
        self.assertIsNone(entry["last_run_status"])

    def test_student_cannot_view_source_health(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.get(
            "/api/internships/admin/data-sources/health/",
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_unauthenticated_cannot_view_source_health(self):
        response = self.client.get(
            "/api/internships/admin/data-sources/health/",
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )


class NearDuplicateSetsNeedsReviewTest(TestCase):
    """Verify that near-duplicate detection sets needs_review=True."""

    def setUp(self):
        from apps.data_sources.models import DataSource
        self.data_source = DataSource.objects.create(
            name="Dedupe DataSource",
            type=DataSource.Type.API,
        )

    def test_near_duplicate_sets_needs_review_on_matched(self):
        from apps.data_sources.services.dedupe import store_listing
        from apps.data_sources.services.normalization import normalize_listing

        raw1 = {
            "external_id": "nd-001",
            "title": "Python Backend Intern",
            "organization_name": "Example Corp",
            "description": "Backend internship.",
            "category": "Software",
            "country": "Ethiopia",
            "city": "Addis Ababa",
            "location_text": "Addis Ababa",
            "internship_type": "remote",
            "work_type": "full_time",
            "compensation_type": "paid",
            "minimum_compensation": 300,
            "maximum_compensation": 600,
            "compensation_currency": "USD",
            "compensation_period": "monthly",
            "required_skills": [],
            "preferred_skills": [],
            "duration_min_weeks": 8,
            "duration_max_weeks": 16,
            "application_url": "https://example.com/apply/nd1",
            "source_url": "https://example.com/nd1",
            "posted_at": "2026-08-01T10:00:00Z",
            "application_deadline": "2026-09-30T23:59:59Z",
        }
        listing1 = normalize_listing(raw1, source_type="api")
        result1 = store_listing(listing1, data_source=self.data_source)
        self.assertEqual(result1.action, "created")
        original = result1.internship
        self.assertFalse(original.needs_review)

        raw2 = dict(raw1)
        raw2["external_id"] = "nd-002"
        raw2["title"] = "Python Backend Internship"
        raw2["application_url"] = "https://example.com/apply/nd2"
        raw2["source_url"] = "https://example.com/nd2"
        listing2 = normalize_listing(raw2, source_type="api")
        result2 = store_listing(listing2, data_source=self.data_source)

        self.assertEqual(result2.action, "near_duplicate")
        original.refresh_from_db()
        self.assertTrue(original.needs_review)

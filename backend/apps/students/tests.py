from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status
from .models import StudentProfile, Student, CareerInterest, StudentSkill, StudentInterest
from apps.internships.models import Skill

User = get_user_model()


class StudentProfileModelTest(TestCase):
    """Test cases for StudentProfile model"""

    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        self.skill = Skill.objects.create(name='Python')

    def test_create_student_profile(self):
        """Test creating a student profile"""
        profile = StudentProfile.objects.create(
            user=self.user,
            phone='+1234567890',
            country='USA',
            city='New York',
            education_level='bachelor',
            field_of_study='Computer Science',
            university='MIT'
        )
        profile.skills.add(self.skill)
        self.assertEqual(profile.user, self.user)
        self.assertEqual(profile.education_level, 'bachelor')

    def test_profile_str(self):
        """Test profile string representation"""
        profile = StudentProfile.objects.create(user=self.user)
        self.assertEqual(str(profile), 'test@example.com - Student Profile')

    def test_compensation_validation_paid(self):
        """Test compensation validation for paid preference"""
        profile = StudentProfile(
            user=self.user,
            compensation_preference='paid',
            minimum_compensation=None,
            maximum_compensation=None
        )
        with self.assertRaises(ValidationError):
            profile.full_clean()

    def test_compensation_validation_range(self):
        """Test compensation range validation"""
        profile = StudentProfile(
            user=self.user,
            compensation_preference='paid',
            minimum_compensation=5000,
            maximum_compensation=3000
        )
        with self.assertRaises(ValidationError):
            profile.full_clean()

    def test_duration_validation(self):
        """Test internship duration validation"""
        profile = StudentProfile(
            user=self.user,
            internship_duration_min_weeks=12,
            internship_duration_max_weeks=8
        )
        with self.assertRaises(ValidationError):
            profile.full_clean()

    def test_unique_profile_per_user(self):
        """Test that each user can have only one profile"""
        StudentProfile.objects.create(user=self.user)
        with self.assertRaises(Exception):
            StudentProfile.objects.create(user=self.user)

    def test_default_preferences(self):
        """Test default preference values"""
        profile = StudentProfile.objects.create(user=self.user)
        self.assertEqual(profile.internship_type, 'any')
        self.assertEqual(profile.work_type, 'either')
        self.assertEqual(profile.compensation_preference, 'either')
        self.assertEqual(profile.compensation_currency, 'USD')

    def test_skills_relationship(self):
        """Test skills many-to-many relationship"""
        profile = StudentProfile.objects.create(user=self.user)
        profile.skills.add(self.skill)
        self.assertEqual(profile.skills.count(), 1)
        self.assertIn(self.skill, profile.skills.all())

    def test_json_fields(self):
        """Test JSON field storage (excluding interests — now an M2M)."""
        profile = StudentProfile.objects.create(
            user=self.user,
            preferred_locations=['New York', 'San Francisco', 'Remote'],
            preferred_industries=['Tech', 'Finance'],
            preferred_roles=['Software Engineer', 'Data Scientist']
        )
        self.assertEqual(len(profile.preferred_locations), 3)
        self.assertIn('New York', profile.preferred_locations)
        self.assertEqual(len(profile.preferred_industries), 2)
        self.assertEqual(len(profile.preferred_roles), 2)

    def test_willing_to_relocate(self):
        """Test willing to relocate field"""
        profile = StudentProfile.objects.create(
            user=self.user,
            willing_to_relocate=True
        )
        self.assertTrue(profile.willing_to_relocate)


class StudentProfileAPITest(TestCase):
    """Test cases for Student Profile API endpoints"""

    def setUp(self):
        """Set up test data and client"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='testpass123'
        )
        self.skill = Skill.objects.create(name='Python')

    def test_get_profile(self):
        """Test getting student profile"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/students/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Profile should be auto-created
        self.assertIn('user', response.data)

    def test_update_profile(self):
        """Test updating student profile with background embedding regeneration"""
        from unittest.mock import patch

        self.client.force_authenticate(user=self.user)

        # Mock the embedding task to avoid actual Celery execution
        with patch('apps.students.views.generate_student_embedding_task.delay'):
            response = self.client.patch('/api/students/', {
                'phone': '+1234567890',
                'country': 'USA',
                'education_level': 'bachelor'
            }, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data['phone'], '+1234567890')

    def test_update_profile_with_skills(self):
        """Test updating profile (skills field is read-only via /api/students/)."""
        self.client.force_authenticate(user=self.user)
        response = self.client.patch('/api/students/', {
            'phone': '+1234567890',
            'skills': [self.skill.id],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_compensation_validation_api(self):
        """Test compensation validation through API"""
        self.client.force_authenticate(user=self.user)
        response = self.client.patch('/api/students/', {
            'compensation_preference': 'paid',
            'minimum_compensation': None,
            'maximum_compensation': 10000
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upload_cv(self):
        """Test CV upload endpoint with background processing"""
        from unittest.mock import patch
        from .models import CV

        self.client.force_authenticate(user=self.user)

        from io import BytesIO
        from django.core.files.uploadedfile import SimpleUploadedFile

        cv_content = (
            b"%PDF-1.4\n"
            b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"trailer<</Root 1 0 R>>\n"
            b"%%EOF\n"
        )
        cv_file = SimpleUploadedFile(
            "test_cv.pdf",
            cv_content,
            content_type="application/pdf"
        )

        # Mock the task to avoid actual Celery execution in tests
        with patch('apps.students.views.process_cv.delay'):
            response = self.client.post(
                '/api/students/cv/upload/', {'file': cv_file})
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertIn('cv_id', response.data)
            self.assertIn('processing_status', response.data)
            self.assertEqual(
                response.data['processing_status'], CV.STATUS_PENDING)

            # Verify CV was created
            cv = CV.objects.get(id=response.data['cv_id'])
            self.assertEqual(cv.student, self.user)
            self.assertEqual(cv.processing_status, CV.STATUS_PENDING)

    def test_upload_cv_invalid_format(self):
        """Test CV upload with invalid file format"""
        self.client.force_authenticate(user=self.user)

        from io import BytesIO
        from django.core.files.uploadedfile import SimpleUploadedFile

        invalid_file = SimpleUploadedFile(
            "test.txt",
            b"Invalid file",
            content_type="text/plain"
        )

        response = self.client.post(
            '/api/students/cv/upload/', {'file': invalid_file})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cv_status_endpoint(self):
        """Test CV status endpoint"""
        from .models import CV

        self.client.force_authenticate(user=self.user)

        # Create a CV
        cv = CV.objects.create(
            student=self.user,
            processing_status=CV.STATUS_PROCESSING,
            processing_error=None
        )

        response = self.client.get(f'/api/students/cv/{cv.id}/status/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['cv_id'], cv.id)
        self.assertEqual(
            response.data['processing_status'], CV.STATUS_PROCESSING)

    def test_cv_status_not_found(self):
        """Test CV status endpoint with non-existent CV"""
        self.client.force_authenticate(user=self.user)

        response = self.client.get('/api/students/cv/99999/status/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cv_analysis_structured_data(self):
        """Test that CV analysis returns structured JSON data"""
        from .services.cv_analysis import analyze_cv

        test_cv_text = """
        Skills: Python, Django, React, SQL
        Education: Bachelor of Computer Science, University of Gondar
        Experience: Backend Developer at ABC Company
        Projects: AI Internship Platform using Python and Django
        Certifications: AWS Certified Developer
        """

        analysis = analyze_cv(test_cv_text)

        # Verify all fields are lists
        self.assertIsInstance(analysis['skills'], list)
        self.assertIsInstance(analysis['education'], list)
        self.assertIsInstance(analysis['experience'], list)
        self.assertIsInstance(analysis['projects'], list)
        self.assertIsInstance(analysis['certifications'], list)

    def test_cv_analysis_extracts_all_projects_multiple(self):
        """Test that CV analysis parses ALL projects from a multi-project CV."""
        from .services.cv_analysis import analyze_cv

        test_cv = """
        John Doe
        Email: john@example.com
        
        SKILLS
        Python, Django, React, TypeScript, PostgreSQL, Docker
        
        PROJECTS
        1. Hospital Management System
        Built an end-to-end electronic health records management platform for clinics.
        Technologies: Python, Django, PostgreSQL
        
        2. E-Commerce Platform | React, Node.js, Stripe
        Developed a modern responsive storefront with seamless online checkout.
        
        3. AI Chat Assistant
        Created an intelligent conversational bot using OpenAI API and FastAPI.
        Technologies: Python, FastAPI, Docker
        
        EDUCATION
        B.Sc. in Computer Science - AAU
        """

        analysis = analyze_cv(test_cv)
        projects = analysis['projects']

        # Should extract all 3 projects
        self.assertEqual(len(projects), 3)
        self.assertEqual(projects[0]['name'], 'Hospital Management System')
        self.assertIn('Django', projects[0]['technologies'])
        self.assertEqual(projects[1]['name'], 'E-Commerce Platform')
        self.assertEqual(projects[2]['name'], 'AI Chat Assistant')
        self.assertIn('FastAPI', projects[2]['technologies'])


class StudentModelTest(TestCase):
    """
    Test cases for Student model (Table 3.3) and User<->Student composition (Section 3.8.4).
    """

    def setUp(self):
        self.user = User.objects.create_user(
            email='student_test@example.com',
            password='securepassword123',
        )

    def test_create_student_all_fields(self):
        """Test creating Student with all Table 3.3 fields."""
        from .models import Student
        import datetime

        student = Student.objects.create(
            user=self.user,
            education_level='bachelor',
            field_of_study='Software Engineering',
            university='Addis Ababa University',
            current_year='4th Year',
            experience_level='intermediate',
            preferred_country='Ethiopia',
            preferred_city='Addis Ababa',
            work_mode='hybrid',
            internship_type='full_time',
            availability_start=datetime.date(2026, 9, 1),
            availability_end=datetime.date(2027, 2, 28),
        )

        self.assertEqual(student.user, self.user)
        self.assertEqual(self.user.student, student)
        self.assertEqual(student.education_level, 'bachelor')
        self.assertEqual(student.field_of_study, 'Software Engineering')
        self.assertEqual(student.university, 'Addis Ababa University')
        self.assertEqual(student.current_year, '4th Year')
        self.assertEqual(student.experience_level, 'intermediate')
        self.assertEqual(student.preferred_country, 'Ethiopia')
        self.assertEqual(student.preferred_city, 'Addis Ababa')
        self.assertEqual(student.work_mode, 'hybrid')
        self.assertEqual(student.internship_type, 'full_time')
        self.assertEqual(str(student.availability_start), '2026-09-01')
        self.assertEqual(str(student.availability_end), '2027-02-28')
        self.assertIsNotNone(student.created_at)
        self.assertIsNotNone(student.updated_at)
        self.assertEqual(str(student), 'student_test@example.com - Student')

    def test_user_student_composition_cascade_delete(self):
        """
        User <-> Student is a composition (Section 3.8.4):
        Deleting User must cascade-delete the Student record.
        """
        from .models import Student

        student = Student.objects.create(
            user=self.user,
            university='MIT',
            field_of_study='Computer Science',
        )
        student_id = student.id

        # Delete User
        self.user.delete()

        # Student must be cascade deleted
        self.assertFalse(Student.objects.filter(id=student_id).exists())

    def test_delete_student_does_not_delete_user(self):
        """
        Deleting Student should NOT delete the User.
        """
        from .models import Student

        student = Student.objects.create(
            user=self.user,
            university='Stanford',
            field_of_study='AI',
        )
        student.delete()

        # User must still exist
        self.assertTrue(User.objects.filter(id=self.user.id).exists())

    def test_user_student_one_to_one_uniqueness(self):
        """
        Each User can have only one Student record.
        """
        from .models import Student
        from django.db import IntegrityError

        Student.objects.create(
            user=self.user,
            university='MIT',
        )
        with self.assertRaises(IntegrityError):
            Student.objects.create(
                user=self.user,
                university='Harvard',
            )


class SkillsAndInterestsModelTest(TestCase):
    """
    Test cases for Task 1.3: Skills & Interests (StudentSkill, CareerInterest, StudentInterest).
    """

    def setUp(self):
        self.user = User.objects.create_user(
            email='skills_test@example.com',
            password='securepassword123',
        )
        self.student = Student.objects.create(
            user=self.user,
            university='MIT',
            field_of_study='Computer Science',
        )
        self.skill = Skill.objects.create(
            name='Python',
            category='Programming Languages',
        )
        self.interest = CareerInterest.objects.create(
            name='AI & ML',
            description='Artificial Intelligence and Machine Learning',
        )

    def test_student_skill_creation_and_proficiency(self):
        """Test creating StudentSkill with proficiency."""
        from .models import StudentSkill

        student_skill = StudentSkill.objects.create(
            student=self.student,
            skill=self.skill,
            proficiency=StudentSkill.Proficiency.ADVANCED,
        )
        self.assertEqual(student_skill.student, self.student)
        self.assertEqual(student_skill.skill, self.skill)
        self.assertEqual(student_skill.proficiency, 'advanced')
        self.assertEqual(self.student.skills.count(), 1)
        self.assertIn(self.skill, self.student.skills.all())

    def test_duplicate_student_skill_raises_integrity_error(self):
        """
        Check: Attempting to add the same skill twice to one student raises IntegrityError.
        Prevents inflating match scores.
        """
        from .models import StudentSkill
        from django.db import IntegrityError

        StudentSkill.objects.create(
            student=self.student,
            skill=self.skill,
            proficiency=StudentSkill.Proficiency.BEGINNER,
        )
        with self.assertRaises(IntegrityError):
            StudentSkill.objects.create(
                student=self.student,
                skill=self.skill,
                proficiency=StudentSkill.Proficiency.ADVANCED,
            )

    def test_student_interest_creation_and_uniqueness(self):
        """Test creating StudentInterest and verifying unique constraint."""
        from .models import StudentInterest
        from django.db import IntegrityError

        student_interest = StudentInterest.objects.create(
            student=self.student,
            interest=self.interest,
        )
        self.assertEqual(self.student.interests.count(), 1)
        self.assertIn(self.interest, self.student.interests.all())

        with self.assertRaises(IntegrityError):
            StudentInterest.objects.create(
                student=self.student,
                interest=self.interest,
            )

    def test_cascade_delete_student_deletes_skills_and_interests(self):
        """
        Deleting Student cascade-deletes StudentSkill and StudentInterest rows,
        but preserves the catalogue Skill and CareerInterest rows.
        """
        from .models import StudentSkill, StudentInterest

        ss = StudentSkill.objects.create(
            student=self.student, skill=self.skill)
        si = StudentInterest.objects.create(
            student=self.student, interest=self.interest)
        ss_id = ss.id
        si_id = si.id
        skill_id = self.skill.id
        interest_id = self.interest.id

        self.student.delete()

        self.assertFalse(StudentSkill.objects.filter(id=ss_id).exists())
        self.assertFalse(StudentInterest.objects.filter(id=si_id).exists())
        self.assertTrue(Skill.objects.filter(id=skill_id).exists())
        self.assertTrue(CareerInterest.objects.filter(id=interest_id).exists())


class Phase3StudentMeAPITest(TestCase):
    """
    Phase 3 Task 3.1 — `GET/PATCH /api/students/me/`.
    Personal info + education (Sections 5.3.1-5.3.2) with education fields
    validated against fixed choice lists (Section 3.11.1).
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='phase3_student@example.com',
            username='phase3student',
            password='testpass123',
            role=User.Role.STUDENT,
        )
        self.profile = StudentProfile.objects.create(user=self.user)

    def test_get_me_returns_personal_info_and_education(self):
        self.profile.phone = '+251911223344'
        self.profile.country = 'Ethiopia'
        self.profile.city = 'Addis Ababa'
        self.profile.education_level = 'bachelor'
        self.profile.current_year = 'third_year'
        self.profile.field_of_study = 'computer_science'
        self.profile.university = 'Addis Ababa University'
        self.profile.save()

        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/students/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['phone'], '+251911223344')
        self.assertEqual(response.data['country'], 'Ethiopia')
        self.assertEqual(response.data['city'], 'Addis Ababa')
        self.assertEqual(response.data['education_level'], 'bachelor')
        self.assertEqual(response.data['current_year'], 'third_year')
        self.assertEqual(response.data['field_of_study'], 'computer_science')
        self.assertEqual(response.data['university'], 'Addis Ababa University')

    def test_patch_valid_persists_and_get_reflects_immediately(self):
        self.client.force_authenticate(user=self.user)
        patch_response = self.client.patch('/api/students/me/', {
            'bio': 'Backend developer interested in AI research.',
            'education_level': 'master',
            'current_year': 'first_year',
            'field_of_study': 'artificial_intelligence',
            'university': 'MIT',
        }, format='json')
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)

        get_response = self.client.get('/api/students/me/')
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertEqual(get_response.data['education_level'], 'master')
        self.assertEqual(get_response.data['current_year'], 'first_year')
        self.assertEqual(
            get_response.data['field_of_study'], 'artificial_intelligence')
        self.assertEqual(get_response.data['university'], 'MIT')

        # Persisted at the model level too
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.education_level, 'master')
        self.assertEqual(self.profile.current_year, 'first_year')
        self.assertEqual(self.profile.field_of_study,
                         'artificial_intelligence')

    def test_patch_invalid_education_level_returns_400(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch('/api/students/me/', {
            'education_level': 'some_fake_level',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('education_level', response.data)

    def test_patch_invalid_current_year_returns_400(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch('/api/students/me/', {
            'current_year': 'sophomore-extra',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('current_year', response.data)

    def test_patch_invalid_field_of_study_returns_400(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch('/api/students/me/', {
            'field_of_study': 'Quantum Basket Weaving',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('field_of_study', response.data)

    def test_me_endpoint_requires_student_role(self):
        """
        RBAC (Task 2.6): an admin JWT must NOT access the student `me` endpoint.
        """
        from rest_framework_simplejwt.tokens import RefreshToken

        admin = User.objects.create_user(
            email='phase3_admin@example.com',
            username='phase3admin',
            password='testpass123',
            role=User.Role.ADMIN,
            is_staff=True,
        )
        token = str(RefreshToken.for_user(admin).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = self.client.get('/api/students/me/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class Phase3StudentSkillsInterestsAPITest(TestCase):
    """
    Phase 3 Task 3.2 — `GET/POST/DELETE /api/students/me/skills/` and
    `/interests/`. Skills and career interests are validated against the
    Task 1.3 catalogue (Skill / CareerInterest) — no free-text input, so
    Phase 6 matching never degrades to fuzzy string matching.

    Decision: free-text is rejected with 400 (no "suggest new skill" queue).
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='phase3_skills@example.com',
            username='phase3skills',
            password='testpass123',
            role=User.Role.STUDENT,
        )
        self.profile = StudentProfile.objects.create(user=self.user)
        self.python = Skill.objects.create(
            name='Python', category='Programming Languages')
        self.django = Skill.objects.create(
            name='Django', category='Frameworks')
        self.ai_interest = CareerInterest.objects.create(name='AI & ML')
        self.profile.interests.set([self.ai_interest])
        self.client.force_authenticate(user=self.user)

    # ----- Skills ----------------------------------------------------
    def test_get_skills_empty_by_default(self):
        response = self.client.get('/api/students/me/skills/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_post_skill_adds_to_profile(self):
        response = self.client.post(
            '/api/students/me/skills/', {'skill_id': self.python.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Python')
        self.assertEqual(
            set(self.profile.skills.values_list('name', flat=True)), {'Python'})

    def test_post_skill_not_in_catalogue_returns_400(self):
        """Free-text / non-catalogue skill must be rejected (400)."""
        response = self.client.post(
            '/api/students/me/skills/', {'skill_id': 999999}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('skill_id', response.data)

    def test_post_free_text_skill_name_returns_400(self):
        """Students must send a catalogue ID, not a skill name string."""
        response = self.client.post(
            '/api/students/me/skills/', {'skill_id': 'Cobol'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_skill_removes_from_profile(self):
        self.profile.skills.add(self.python, self.django)
        response = self.client.delete(
            '/api/students/me/skills/', {'skill_id': self.python.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(
            set(self.profile.skills.values_list('name', flat=True)), {'Django'})

    def test_delete_skill_not_in_profile_is_idempotent(self):
        response = self.client.delete(
            '/api/students/me/skills/', {'skill_id': self.python.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_get_skills_after_add(self):
        self.profile.skills.add(self.python, self.django)
        response = self.client.get('/api/students/me/skills/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {item['name'] for item in response.data}
        self.assertEqual(names, {'Python', 'Django'})

    # ----- Interests ----------------------------------------------------
    def test_get_interests_returns_existing(self):
        response = self.client.get('/api/students/me/interests/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {item['name'] for item in response.data}
        self.assertEqual(names, {'AI & ML'})

    def test_post_interest_adds_to_profile(self):
        new_interest = CareerInterest.objects.create(name='Data Science')
        response = self.client.post(
            '/api/students/me/interests/', {'interest_id': new_interest.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            set(self.profile.interests.values_list('name', flat=True)),
            {'AI & ML', 'Data Science'},
        )

    def test_post_interest_not_in_catalogue_returns_400(self):
        response = self.client.post(
            '/api/students/me/interests/', {'interest_id': 999999}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('interest_id', response.data)

    def test_post_free_text_interest_returns_400(self):
        response = self.client.post(
            '/api/students/me/interests/', {'interest_id': 'Blockchain'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_interest_removes_from_profile(self):
        response = self.client.delete(
            '/api/students/me/interests/', {'interest_id': self.ai_interest.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.profile.interests.count(), 0)

    # ----- RBAC -------------------------------------------------------
    def test_skills_endpoint_requires_student_role(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        admin = User.objects.create_user(
            email='phase3_skills_admin@example.com',
            username='phase3skillsadmin',
            password='testpass123',
            role=User.Role.ADMIN,
            is_staff=True,
        )
        self.client.force_authenticate(user=None)
        token = str(RefreshToken.for_user(admin).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = self.client.get('/api/students/me/skills/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_interests_endpoint_requires_student_role(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        admin = User.objects.create_user(
            email='phase3_interests_admin@example.com',
            username='phase3interestsadmin',
            password='testpass123',
            role=User.Role.ADMIN,
            is_staff=True,
        )
        self.client.force_authenticate(user=None)
        token = str(RefreshToken.for_user(admin).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = self.client.get('/api/students/me/interests/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class Phase3StudentPreferencesAPITest(TestCase):
    """
    Phase 3 Task 3.3 — `GET/PATCH /api/students/me/preferences/`.
    Internship preferences: country, city, work_mode, internship_type,
    availability_start/end.

    Basic invariant: availability_end < availability_start → 400.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='phase3_prefs@example.com',
            username='phase3prefs',
            password='testpass123',
            role=User.Role.STUDENT,
        )
        self.profile = StudentProfile.objects.create(user=self.user)
        self.client.force_authenticate(user=self.user)

    def test_get_preferences_returns_defaults(self):
        response = self.client.get('/api/students/me/preferences/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['country'], '')
        self.assertEqual(response.data['city'], '')
        self.assertEqual(response.data['work_mode'], 'either')
        self.assertEqual(response.data['internship_type'], 'any')
        self.assertIsNone(response.data['availability_start'])
        self.assertIsNone(response.data['availability_end'])

    def test_patch_preferences_persists_and_get_reflects(self):
        patch_response = self.client.patch('/api/students/me/preferences/', {
            'country': 'Ethiopia',
            'city': 'Addis Ababa',
            'work_mode': 'full_time',
            'internship_type': 'remote',
            'availability_start': '2026-09-01',
            'availability_end': '2026-12-31',
        }, format='json')
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data['country'], 'Ethiopia')
        self.assertEqual(patch_response.data['city'], 'Addis Ababa')
        self.assertEqual(patch_response.data['work_mode'], 'full_time')
        self.assertEqual(patch_response.data['internship_type'], 'remote')
        self.assertEqual(
            patch_response.data['availability_start'], '2026-09-01')
        self.assertEqual(patch_response.data['availability_end'], '2026-12-31')

        # Persisted at the model level (work_mode → StudentProfile.work_type)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.country, 'Ethiopia')
        self.assertEqual(self.profile.city, 'Addis Ababa')
        self.assertEqual(self.profile.work_type, 'full_time')
        self.assertEqual(self.profile.internship_type, 'remote')
        self.assertEqual(str(self.profile.availability_start), '2026-09-01')
        self.assertEqual(str(self.profile.availability_end), '2026-12-31')

        # GET reflects immediately
        get_response = self.client.get('/api/students/me/preferences/')
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertEqual(get_response.data['work_mode'], 'full_time')
        self.assertEqual(get_response.data['availability_end'], '2026-12-31')

    def test_patch_availability_end_before_start_returns_400(self):
        response = self.client.patch('/api/students/me/preferences/', {
            'availability_start': '2026-12-31',
            'availability_end': '2026-09-01',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('availability_end', response.data)

    def test_patch_availability_equal_dates_is_valid(self):
        response = self.client.patch('/api/students/me/preferences/', {
            'availability_start': '2026-09-01',
            'availability_end': '2026-09-01',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['availability_start'], '2026-09-01')
        self.assertEqual(response.data['availability_end'], '2026-09-01')

    def test_patch_invalid_work_mode_returns_400(self):
        response = self.client.patch('/api/students/me/preferences/', {
            'work_mode': 'gig',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('work_mode', response.data)

    def test_patch_invalid_internship_type_returns_400(self):
        response = self.client.patch('/api/students/me/preferences/', {
            'internship_type': 'teleport',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('internship_type', response.data)

    def test_preferences_endpoint_requires_student_role(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        admin = User.objects.create_user(
            email='phase3_prefs_admin@example.com',
            username='phase3prefsadmin',
            password='testpass123',
            role=User.Role.ADMIN,
            is_staff=True,
        )
        self.client.force_authenticate(user=None)
        token = str(RefreshToken.for_user(admin).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = self.client.patch('/api/students/me/preferences/', {
            'city': 'Addis Ababa',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class Phase3ResumeUploadAPITest(TestCase):
    """
    Phase 3 Task 3.4 — `POST /api/students/me/resume/` (Section 5.3.6).

    Accepts genuine PDF/DOCX only (≤ 5 MB). MIME type is validated by content
    sniffing (Section 7.6.5): a .exe renamed to .pdf must be rejected.
    On success the file is stored, `StudentProfile.resume` points to it, and
    the resume-parsing Celery task (`process_cv`) is queued.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='phase3_resume@example.com',
            username='phase3resume',
            password='testpass123',
            role=User.Role.STUDENT,
        )
        self.profile = StudentProfile.objects.create(user=self.user)
        self.client.force_authenticate(user=self.user)

    @staticmethod
    def _pdf_bytes():
        return (
            b"%PDF-1.4\n"
            b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"trailer<</Root 1 0 R>>\n"
            b"%%EOF\n"
        )

    @staticmethod
    def _docx_bytes():
        from io import BytesIO
        import zipfile

        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr(
                "[Content_Types].xml",
                b'<?xml version="1.0"?><Types xmlns="http://schemas'
                b'.openxmlformats.org/package/2006/content-types"/>',
            )
            archive.writestr(
                "word/document.xml",
                b'<?xml version="1.0"?><w:document xmlns:w="http://schema'
                b's.openxmlformats.org/wordprocessingml/2006/main"/>',
            )
        return buffer.getvalue()

    def _upload(self, content, filename='resume.pdf'):
        from django.core.files.uploadedfile import SimpleUploadedFile

        resume = SimpleUploadedFile(filename, content)
        return self.client.post(
            '/api/students/me/resume/', {'file': resume})

    def test_upload_valid_pdf_stored_and_task_queued(self):
        from unittest.mock import patch
        from .models import CV

        # The resume-parsing task and the embedding task are queued via
        # ``transaction.on_commit`` (they must only fire once the upload's
        # transaction commits), so we capture + execute the pending commit
        # callbacks and assert the parsing task was dispatched.
        with patch('apps.students.views.parse_resume.delay') as delay:
            with patch('apps.students.tasks.generate_student_embedding_task.delay'):
                with self.captureOnCommitCallbacks(execute=True):
                    response = self._upload(self._pdf_bytes(), 'resume.pdf')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['processing_status'], CV.STATUS_PENDING)
        self.assertIn('cv_id', response.data)
        self.assertIn('resume_url', response.data)

        # A CV record was created and the resume-parsing task was queued.
        cv = CV.objects.get(id=response.data['cv_id'])
        self.assertEqual(cv.student, self.user)
        self.assertEqual(cv.processing_status, CV.STATUS_PENDING)
        delay.assert_called_once_with(self.user.id)

        # student.resume points to the stored object.
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.resume)
        self.assertEqual(self.profile.resume.name, cv.file.name)

    def test_upload_valid_docx_accepted(self):
        from unittest.mock import patch

        with patch('apps.students.views.parse_resume.delay'), \
                patch('apps.students.tasks.generate_student_embedding_task.delay'):
            response = self._upload(
                self._docx_bytes(), 'resume.docx')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.resume.name.endswith('.docx'))

    def test_exe_renamed_to_pdf_rejected(self):
        """A Windows executable disguised as .pdf must be rejected (400)."""
        exe_bytes = (
            b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00"
            b"\xb8\x00\x00\x00\x00\x00\x00\x00\x40\x00\x00\x00"
            b"It's a PE, not a PDF."
        )
        response = self._upload(exe_bytes, 'malware.pdf')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response.data)

    def test_non_matching_content_extension_rejected(self):
        """A real DOCX zip renamed to .pdf is rejected (content ≠ extension)."""
        response = self._upload(self._docx_bytes(), 'actually.docx.pdf')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_zip_that_is_not_docx_rejected(self):
        """A ZIP with PK magic but no OOXML word/ tree is not a DOCX → 400."""
        from io import BytesIO
        import zipfile

        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("hello.txt", b"just a plain zip file")
        response = self._upload(buffer.getvalue(), 'resume.docx')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_plain_text_as_pdf_rejected(self):
        response = self._upload(b'not a pdf at all', 'resume.pdf')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_oversize_file_rejected(self):
        big = self._pdf_bytes() + b'x' * (5 * 1024 * 1024 + 1024)
        response = self._upload(big, 'resume.pdf')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unallowed_extension_rejected(self):
        response = self._upload(self._pdf_bytes(), 'resume.exe')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_file_returns_400(self):
        # The endpoint only accepts multipart form-data, so a multipart request
        # with no file is how a client reaches the missing-file case.
        response = self.client.post(
            '/api/students/me/resume/', {}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_get_resume_status(self):
        from unittest.mock import patch

        self.assertEqual(self.client.get('/api/students/me/resume/').data[
            'has_resume'], False)
        with patch('apps.students.tasks.generate_student_embedding_task.delay'), \
                patch('apps.students.views.parse_resume.delay'):
            self._upload(self._pdf_bytes(), 'resume.pdf')
        response = self.client.get('/api/students/me/resume/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['has_resume'])
        self.assertIsNotNone(response.data['resume_url'])
        self.assertEqual(response.data['processing_status'], 'PENDING')

    def test_resume_endpoint_requires_student_role(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        admin = User.objects.create_user(
            email='phase3_resume_admin@example.com',
            username='phase3resumeadmin',
            password='testpass123',
            role=User.Role.ADMIN,
            is_staff=True,
        )
        self.client.force_authenticate(user=None)
        token = str(RefreshToken.for_user(admin).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = self._upload(self._pdf_bytes(), 'resume.pdf')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class Phase3ResumeParsingTaskTest(TestCase):
    """
    Phase 3 Task 3.5 — async resume parsing via the ``parse_resume`` Celery
    task (Section 5.3.6 / Figure 5.2).

    On a successful upload the endpoint queues ``parse_resume.delay(student_id)``.
    Tests run with ``CELERY_TASK_ALWAYS_EAGER=True`` (config.settings.test) so
    the task executes synchronously — confirming it ran by observing the
    ``StudentProfile.resume_parsed=True`` DB flag.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='phase3_parse@example.com',
            username='phase3parse',
            password='testpass123',
            role=User.Role.STUDENT,
        )
        self.profile = StudentProfile.objects.create(user=self.user)
        self.client.force_authenticate(user=self.user)

    @staticmethod
    def _pdf_bytes():
        """
        Build a real, parseable PDF with extractable text using pypdf's writer
        (pypdf is already a dependency). Content-sniffing accepts it and the
        eager parse_resume task can actually extract text from it.
        """
        from io import BytesIO
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

        w = PdfWriter()
        page = w.add_blank_page(width=612, height=792)

        stream = DecodedStreamObject()
        stream.set_data(
            b"BT /F1 24 Tf 100 700 Td "
            b"(Python Django resume with solid web development skills) Tj ET"
        )
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({
                NameObject("/F1"): DictionaryObject({
                    NameObject("/Type"): NameObject("/Font"),
                    NameObject("/Subtype"): NameObject("/Type1"),
                    NameObject("/BaseFont"): NameObject("/Helvetica"),
                })
            })
        })
        page[NameObject("/Contents")] = w._add_object(stream)

        buf = BytesIO()
        w.write(buf)
        return buf.getvalue()

    def test_upload_queues_and_runs_parse_resume_in_eager_mode(self):
        """
        Upload a valid PDF, then (with eager mode on) confirm the task ran by
        checking that ``StudentProfile.resume_parsed`` was set to True.
        """
        from unittest.mock import patch
        from django.core.files.uploadedfile import SimpleUploadedFile
        from apps.students.tasks import parse_resume

        # The broker is not wired until Phase 5, so eager execution is simulated
        # here: the queued ``parse_resume`` task is run synchronously (exactly
        # what ``CELERY_TASK_ALWAYS_EAGER=True`` does) via the on_commit hook,
        # then we assert the resume_parsed DB flag reflects the completed run.
        # The side-effectful embedding + skill-sync steps are stubbed (they are
        # non-fatal in the pipeline, but slow / require external services).
        with patch('apps.students.tasks.regenerate_student_embedding', return_value=None), \
            patch('apps.students.tasks.generate_student_embedding_task.delay'), \
            patch('apps.students.views.parse_resume.delay',
                  side_effect=lambda sid: parse_resume.run(sid)):
            with self.captureOnCommitCallbacks(execute=True):
                resume = SimpleUploadedFile('resume.pdf', self._pdf_bytes())
                response = self.client.post(
                    '/api/students/me/resume/', {'file': resume})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Task ran → the resume_parsed flag is now set.
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.resume_parsed)
        self.assertIsNotNone(self.profile.resume_parsed_at)
        # And the created CV reached COMPLETED.
        from .models import CV
        cv = CV.objects.filter(student=self.user).order_by(
            "-created_at").first()
        self.assertIsNotNone(cv)
        self.assertEqual(cv.processing_status, 'COMPLETED')

    def test_parse_resume_task_sets_flag_directly(self):
        """
        Directly invoke ``parse_resume`` (as the eager worker would) and assert
        it runs end-to-end, setting resume_parsed=True and marking the CV done.
        """
        from unittest.mock import patch
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .models import CV

        cv = CV.objects.create(
            student=self.user,
            file=SimpleUploadedFile('resume.pdf', self._pdf_bytes()),
            processing_status=CV.STATUS_PENDING,
        )

        from apps.students.tasks import parse_resume
        with patch('apps.students.tasks.regenerate_student_embedding', return_value=None):
            result = parse_resume.run(self.user.id)

        self.assertEqual(result['status'], 'completed')
        self.assertTrue(result['resume_parsed'])
        self.assertEqual(result['cv_id'], cv.id)

        cv.refresh_from_db()
        self.assertEqual(cv.processing_status, CV.STATUS_COMPLETED)
        self.assertTrue(cv.extracted_text)
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.resume_parsed)
        self.assertIsNotNone(self.profile.resume_parsed_at)

    def test_parse_resume_ignores_cv_replaced_during_processing(self):
        """A stale task must not turn a replacement upload into a 500."""
        from unittest.mock import patch
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .models import CV

        cv = CV.objects.create(
            student=self.user,
            file=SimpleUploadedFile('resume.pdf', self._pdf_bytes()),
            processing_status=CV.STATUS_PENDING,
        )

        def extract_and_replace(_file):
            cv.delete()
            return "Python Django resume with enough extractable text"

        from apps.students.tasks import parse_resume
        with patch('apps.students.tasks.extract_cv_text', side_effect=extract_and_replace):
            result = parse_resume.run(self.user.id)

        self.assertEqual(result['status'], 'superseded')
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.resume_parsed)


class ProfileCompletionTest(TestCase):
    """
    Phase 3 Task 3.6 — profile completion indicator (Sections 3.9.1 / 3.9.2).

    The completion percentage is based on how many of six sections are filled:
    {personal, education, >=1 skill, >=1 interest, preferences, resume}.
    Each section counts equally (1 of 6 → ~16.7%), so percentages climb in
    predictable steps: 0, 17, 33, 50, 67, 83, 100.
    """

    def setUp(self):
        self.skill = Skill.objects.create(name="Python")
        self.interest = CareerInterest.objects.create(
            name="Software Development")
        if not hasattr(self, "_user_seq"):
            self._user_seq = 0

    def _profile(self):
        self._user_seq += 1
        user = User.objects.create_user(
            email=f"completion{self._user_seq}@example.com",
            username=f"completion{self._user_seq}",
            password="testpass123",
            role=User.Role.STUDENT,
        )
        return StudentProfile.objects.create(user=user)

    @staticmethod
    def _fill_personal(p):
        p.phone = "111-222-3333"

    @staticmethod
    def _fill_education(p):
        p.education_level = "bachelor"

    @staticmethod
    def _fill_preferences(p):
        p.work_type = "full_time"

    @staticmethod
    def _fill_resume(p):
        p.resume.name = "student_resumes/dummy.pdf"

    def _assert_percent(self, profile, expected):
        from .services.profile_completion import compute_profile_completion
        result = compute_profile_completion(profile)
        self.assertEqual(result["percent"], expected)

    def test_empty_profile_is_0_percent(self):
        from .services.profile_completion import compute_profile_completion
        p = self._profile()
        self._assert_percent(p, 0)
        self.assertFalse(
            any(compute_profile_completion(p)["sections"].values()))

    def test_each_section_individually_counts_one_sixth(self):
        """Filling only ONE section → 17% (16.7% rounded)."""
        from .services.profile_completion import compute_profile_completion

        cases = {
            "personal": lambda p: self._fill_personal(p),
            "education": lambda p: self._fill_education(p),
            "skills": lambda p: p.skills.add(self.skill),
            "interests": lambda p: p.interests.add(self.interest),
            "preferences": lambda p: self._fill_preferences(p),
            "resume": lambda p: self._fill_resume(p),
        }
        for name, fill in cases.items():
            p = self._profile()
            fill(p)
            p.save()
            result = compute_profile_completion(p)
            self.assertEqual(result["percent"], 17, msg=f"section={name}")
            self.assertTrue(result["sections"][name], msg=f"section={name}")

    def test_filling_all_sections_is_100_percent(self):
        p = self._profile()
        self._fill_personal(p)
        self._fill_education(p)
        p.skills.add(self.skill)
        p.interests.add(self.interest)
        self._fill_preferences(p)
        self._fill_resume(p)
        p.save()
        self._assert_percent(p, 100)

    def test_incremental_fill_increases_percentage_predictably(self):
        """Filling one section at a time yields 17, 33, 50, 67, 83, 100."""
        p = self._profile()

        self._fill_personal(p)
        p.save()
        self._assert_percent(p, 17)

        self._fill_education(p)
        p.save()
        self._assert_percent(p, 33)

        p.skills.add(self.skill)
        self._assert_percent(p, 50)

        p.interests.add(self.interest)
        self._assert_percent(p, 67)

        self._fill_preferences(p)
        p.save()
        self._assert_percent(p, 83)

        self._fill_resume(p)
        p.save()
        self._assert_percent(p, 100)

    def test_preference_defaults_do_not_count_as_filled(self):
        """
        Preference fields that ship with a non-empty default (work_type=either,
        internship_type=any) must NOT count as "filled" until a real choice is
        made, so a profile left at defaults stays predictable.
        """
        from .services.profile_completion import _preferences_complete
        p = self._profile()
        self.assertFalse(_preferences_complete(p))
        p.work_type = "full_time"
        self.assertTrue(_preferences_complete(p))

    def test_completion_exposed_in_me_endpoint(self):
        from rest_framework.test import APIClient
        client = APIClient()
        user = User.objects.create_user(
            email="completion_me@example.com",
            username="completionme",
            password="testpass123",
            role=User.Role.STUDENT,
        )
        profile = StudentProfile.objects.create(user=user)
        client.force_authenticate(user=user)
        resp = client.get("/api/students/me/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["completion"]["percent"], 0)
        # Fill one section and confirm the percentage rises via the API.
        profile.field_of_study = "computer_science"
        profile.save()
        resp = client.get("/api/students/me/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["completion"]["percent"], 17)

    def test_completion_exposed_in_full_profile_endpoint(self):
        from rest_framework.test import APIClient
        client = APIClient()
        user = User.objects.create_user(
            email="completion_profile@example.com",
            username="completionprofile",
            password="testpass123",
            role=User.Role.STUDENT,
        )
        StudentProfile.objects.create(user=user)
        client.force_authenticate(user=user)
        resp = client.get("/api/students/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("completion", resp.data)
        self.assertIn("percent", resp.data["completion"])
        self.assertIn("sections", resp.data["completion"])
        self.assertEqual(resp.data["completion"]["percent"], 0)


class Phase3DefinitionOfDoneTest(TestCase):
    """
    Phase 3 Definition of Done (Table 6.1, TC004-TC005).

    A student can complete a full profile end-to-end via the API (personal,
    education, skills, interests, preferences), upload a resume, and watch the
    profile-completion percentage update live.
    """

    def setUp(self):
        self.skill = Skill.objects.create(name="Python")
        self.skill2 = Skill.objects.create(name="Django")
        self.interest = CareerInterest.objects.create(
            name="Software Development")

    def _register_verify_login(self, email):
        """Full register -> verify-email -> login round trip, returns (client, token)."""
        import re
        from django.core import mail
        from rest_framework.test import APIClient

        client = APIClient()
        self.assertEqual(client.post('/api/auth/register/', {
            'full_name': 'Test Student',
            'email': email,
            'password': 'SecurePass123!',
        }, format='json').status_code, 201)

        user = User.objects.get(email=email)
        match = re.search(
            r'/api/auth/verify-email/(?P<uid>[^/]+)/(?P<token>[^/]+)/',
            mail.outbox[0].body,
        )
        self.assertIsNotNone(match)
        self.client.get(
            f"/api/auth/verify-email/{match.group('uid')}/{match.group('token')}/"
        )
        user.refresh_from_db()
        self.assertTrue(user.is_active)

        login = client.post('/api/auth/login/', {
            'email': email,
            'password': 'SecurePass123!',
        }, format='json')
        self.assertEqual(login.status_code, 200)
        token = login.data['access']
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        return client, user

    def test_tc004_full_profile_completion_via_api(self):
        """
        TC004: Complete personal + education + skills + interests + preferences
        via the Phase 3 API. Completion percentage climbs live from 0% to the
        expected value for five of six sections (83%).
        """
        client, user = self._register_verify_login("tc004@example.com")

        # Starts at 0%
        me = client.get('/api/students/me/')
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data['completion']['percent'], 0)

        # 1. Personal + education (2 sections)
        resp = client.patch('/api/students/me/', {
            'phone': '+15551234567',
            'country': 'Canada',
            'city': 'Toronto',
            'bio': 'Enthusiastic full-stack developer.',
            'education_level': 'bachelor',
            'current_year': 'third_year',
            'field_of_study': 'computer_science',
            'university': 'University of Toronto',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['completion']['percent'], 33)

        # 2. Skill (3rd section)
        resp = client.post('/api/students/me/skills/',
                           {'skill_id': self.skill.id}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        me = client.get('/api/students/me/')
        self.assertEqual(me.data['completion']['percent'], 50)

        # 3. Interest (4th section)
        resp = client.post(
            '/api/students/me/interests/', {'interest_id': self.interest.id}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        me = client.get('/api/students/me/')
        self.assertEqual(me.data['completion']['percent'], 67)

        # 4. Preferences (5th section)
        resp = client.patch('/api/students/me/preferences/', {
            'work_mode': 'full_time',
            'internship_type': 'remote',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        me = client.get('/api/students/me/')
        self.assertEqual(me.data['completion']['percent'], 83)

        # All five non-resume sections are complete.
        self.assertTrue(me.data['completion']['sections']['personal'])
        self.assertTrue(me.data['completion']['sections']['education'])
        self.assertTrue(me.data['completion']['sections']['skills'])
        self.assertTrue(me.data['completion']['sections']['interests'])
        self.assertTrue(me.data['completion']['sections']['preferences'])
        self.assertFalse(me.data['completion']['sections']['resume'])

    def test_tc005_resume_upload_updates_completion_via_api(self):
        """
        TC005: Upload a valid resume via the API and confirm the resume section
        becomes complete — the live completion percentage reaches 100%.
        """
        from unittest.mock import patch
        from django.core.files.uploadedfile import SimpleUploadedFile
        from io import BytesIO
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
        from apps.students.tasks import parse_resume

        client, user = self._register_verify_login("tc005@example.com")

        # Pre-fill the profile via API (personal, education, skills, interests,
        # preferences) so only the resume section remains.
        client.patch('/api/students/me/', {
            'phone': '+15555555555',
            'education_level': 'master',
            'field_of_study': 'data_science',
        }, format='json')
        client.post('/api/students/me/skills/',
                    {'skill_id': self.skill.id}, format='json')
        client.post('/api/students/me/interests/',
                    {'interest_id': self.interest.id}, format='json')
        client.patch('/api/students/me/preferences/', {
            'work_mode': 'part_time',
            'internship_type': 'hybrid',
        }, format='json')

        me = client.get('/api/students/me/')
        self.assertEqual(me.data['completion']['percent'], 83)

        # Build and upload a genuine PDF resume.
        w = PdfWriter()
        page = w.add_blank_page(width=612, height=792)
        stream = DecodedStreamObject()
        stream.set_data(
            b"BT /F1 24 Tf 100 700 Td "
            b"(Python Django resume with solid web development skills) Tj ET"
        )
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({
                NameObject("/F1"): DictionaryObject({
                    NameObject("/Type"): NameObject("/Font"),
                    NameObject("/Subtype"): NameObject("/Type1"),
                    NameObject("/BaseFont"): NameObject("/Helvetica"),
                })
            })
        })
        page[NameObject("/Contents")] = w._add_object(stream)
        buf = BytesIO()
        w.write(buf)

        with patch('apps.students.tasks.regenerate_student_embedding', return_value=None), \
            patch('apps.students.tasks.generate_student_embedding_task.delay'), \
            patch('apps.students.views.parse_resume.delay',
                  side_effect=lambda sid: parse_resume.run(sid)):
            with self.captureOnCommitCallbacks(execute=True):
                resp = client.post('/api/students/me/resume/', {
                    'file': SimpleUploadedFile('resume.pdf', buf.getvalue()),
                }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        from apps.students.models import StudentProfile
        profile = StudentProfile.objects.get(user=user)
        self.assertTrue(profile.resume)

        # Resume section now complete → 100%.
        me = client.get('/api/students/me/')
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data['completion']['percent'], 100)
        self.assertTrue(me.data['completion']['sections']['resume'])


class StudentCatalogueEndpointTest(TestCase):
    """
    Phase 7 Task 7.2 — read-only Task 1.3 catalogues for the student
    profile editor (skill & interest pickers). Both endpoints must only
    return active catalogue rows and require authentication.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='catalogue@example.com',
            username='catalogueuser',
            password='testpass123'
        )
        self.admin = User.objects.create_user(
            email='catalogue_admin@example.com',
            username='catalogueadmin',
            password='testpass123',
            role='admin',
        )

        self.active_skill = Skill.objects.create(
            name='Python', category='Programming')
        self.inactive_skill = Skill.objects.create(
            name='COBOL', is_active=False)
        self.active_interest = CareerInterest.objects.create(
            name='Machine Learning',
            description='AI/ML career paths',
        )
        self.inactive_interest = CareerInterest.objects.create(
            name='Legacy COBOL',
            is_active=False,
        )

    def test_skills_catalogue_returns_only_active_student(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/students/skills/choices/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [row['name'] for row in response.data]
        self.assertIn('Python', names)
        self.assertNotIn('COBOL', names)
        self.assertTrue(all(row['is_active'] for row in response.data))
        # shape matches what POST /api/students/me/skills/ consumes by id
        self.assertIn('id', response.data[0])
        self.assertIn('name', response.data[0])

    def test_skills_catalogue_accessible_to_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/students/skills/choices/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_interests_catalogue_returns_only_active_student(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/students/interests/choices/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [row['name'] for row in response.data]
        self.assertIn('Machine Learning', names)
        self.assertNotIn('Legacy COBOL', names)
        self.assertIn('id', response.data[0])
        self.assertIn('description', response.data[0])

    def test_catalogue_requires_authentication(self):
        response = self.client.get('/api/students/skills/choices/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        response = self.client.get('/api/students/interests/choices/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_catalogue_rows_feed_me_skills_endpoint(self):
        """Adding a catalogue skill by id must succeed for the same id."""
        from unittest.mock import patch
        self.client.force_authenticate(user=self.user)
        with patch('apps.students.views.generate_student_embedding_task.delay'):
            response = self.client.post('/api/students/me/skills/', {
                'skill_id': self.active_skill.id,
            })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class ResumeExtractionPipelineTest(TestCase):
    """
    Task 2.2: Automated CV/Resume Parser Pipeline test suite.
    Verifies:
      - Valid PDF/DOCX resume upload
      - Asynchronous parse_resume_task execution
      - Entity extraction: GPA, GitHub, LinkedIn, email, phone, education, skills
      - StudentProfile automatic field population and skill syncing
      - Polling status endpoint
      - File size and MIME type security validations
    """

    def setUp(self):
        from apps.students.models import StudentProfile, Resume
        from apps.internships.models import Skill
        from rest_framework.test import APIClient

        User = get_user_model()
        self.user = User.objects.create_user(
            email='teststudent_resume@aau.edu.et',
            username='teststudent_resume',
            password='Password123!',
            role=User.Role.STUDENT,
        )
        self.profile = StudentProfile.objects.create(user=self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Seed canonical skills
        for skill_name in ['Python', 'Django', 'React', 'Docker', 'PostgreSQL']:
            Skill.objects.get_or_create(name=skill_name, defaults={'is_active': True})

    @staticmethod
    def _create_test_pdf_bytes(text: str) -> bytes:
        escaped = text.replace("(", "\\(").replace(")", "\\)")
        stream_content = f"BT /F1 12 Tf 50 750 Td ({escaped}) Tj ET".encode("latin-1")
        stream_len = len(stream_content)
        return (
            b"%PDF-1.4\n"
            b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n"
            b"4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
            b"5 0 obj<</Length " + str(stream_len).encode("ascii") + b">>\nstream\n"
            + stream_content +
            b"\nendstream\nendobj\n"
            b"xref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000059 00000 n \n0000000115 00000 n \n0000000227 00000 n \n0000000295 00000 n \n"
            b"trailer<</Size 6/Root 1 0 R>>\nstartxref\n400\n%%EOF\n"
        )

    def test_resume_upload_endpoint_success(self):
        """Upload valid PDF resume returns 201 with resume_id and status PENDING."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from unittest.mock import patch
        from apps.students.models import Resume

        sample_text = (
            "Jane Doe | email: jane.doe@aau.edu.et | phone: +251 91 122 3344 | "
            "GPA: 3.85 / 4.0 | github.com/janedoe | Addis Ababa University | "
            "Bachelor of Science in Software Engineering | Skills: Python, Django, React, Docker"
        )
        pdf_bytes = self._create_test_pdf_bytes(sample_text)
        uploaded_file = SimpleUploadedFile("resume.pdf", pdf_bytes, content_type="application/pdf")

        with patch('apps.students.tasks.parse_resume_task.delay') as mock_delay:
            response = self.client.post('/api/v1/students/resume/', {'file': uploaded_file}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('resume_id', response.data)
        self.assertEqual(response.data['status'], 'PENDING')

        resume = Resume.objects.get(id=response.data['resume_id'])
        self.assertEqual(resume.student, self.profile)
        self.assertEqual(resume.parsing_status, Resume.ParsingStatus.PENDING)

    def test_parse_resume_task_extracts_entities_and_populates_profile(self):
        """parse_resume_task extracts GPA, GitHub, phone, education, skills and updates profile."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from apps.students.models import Resume
        from apps.students.tasks import parse_resume_task

        sample_text = (
            "Jane Doe | email: jane.doe@aau.edu.et | phone: 0911223344 | "
            "GPA: 3.85 / 4.0 | github.com/janedoe | linkedin.com/in/janedoe | "
            "Addis Ababa University | Bachelor of Science in Software Engineering | "
            "Skills: Python, Django, React, Docker"
        )
        pdf_bytes = self._create_test_pdf_bytes(sample_text)
        uploaded_file = SimpleUploadedFile("candidate_resume.pdf", pdf_bytes, content_type="application/pdf")

        resume = Resume.objects.create(
            student=self.profile,
            file=uploaded_file,
            parsing_status=Resume.ParsingStatus.PENDING,
        )

        # Run extraction task
        result = parse_resume_task(resume.id)
        self.assertEqual(result['status'], 'completed')

        resume.refresh_from_db()
        self.assertEqual(resume.parsing_status, Resume.ParsingStatus.COMPLETED)
        self.assertEqual(resume.parsed_data['gpa'], 3.85)
        self.assertEqual(resume.parsed_data['github_url'], 'https://github.com/janedoe')
        self.assertEqual(resume.parsed_data['linkedin_url'], 'https://linkedin.com/in/janedoe')
        self.assertEqual(resume.parsed_data['phone'], '+251911223344')
        self.assertEqual(resume.parsed_data['email'], 'jane.doe@aau.edu.et')
        self.assertEqual(resume.parsed_data['education']['institution'], 'Addis Ababa University')
        self.assertEqual(resume.parsed_data['education']['degree'], 'Bachelor of Science')
        self.assertEqual(resume.parsed_data['education']['field_of_study'], 'Software Engineering')

        # Check extracted skills
        extracted_skills = resume.parsed_data['skills']
        self.assertIn('Python', extracted_skills)
        self.assertIn('Django', extracted_skills)
        self.assertIn('React', extracted_skills)
        self.assertIn('Docker', extracted_skills)

        # Assert StudentProfile was automatically populated
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.phone, '+251911223344')
        self.assertEqual(self.profile.university, 'Addis Ababa University')
        self.assertEqual(self.profile.field_of_study, 'software_engineering')

        # Assert skills are synced in profile.skills
        profile_skills = list(self.profile.skills.values_list('name', flat=True))
        self.assertIn('Python', profile_skills)
        self.assertIn('Django', profile_skills)
        self.assertIn('React', profile_skills)

    def test_parse_docx_resume_task_extracts_entities(self):
        """parse_resume_task supports DOCX format and extracts all entities."""
        import docx
        import io
        from django.core.files.uploadedfile import SimpleUploadedFile
        from apps.students.models import Resume
        from apps.students.tasks import parse_resume_task

        doc = docx.Document()
        doc.add_paragraph("Abebe Molla")
        doc.add_paragraph("Email: abebe.molla@aau.edu.et")
        doc.add_paragraph("Phone: +251 71 234 5678")
        doc.add_paragraph("GitHub: https://github.com/abebemolla")
        doc.add_paragraph("Education: Bachelor of Science in Computer Science from Addis Ababa University")
        doc.add_paragraph("Cumulative GPA: 3.75 / 4.0")
        doc.add_paragraph("Skills: Python, React, PostgreSQL")

        buf = io.BytesIO()
        doc.save(buf)
        uploaded_file = SimpleUploadedFile(
            "resume.docx",
            buf.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

        resume = Resume.objects.create(
            student=self.profile,
            file=uploaded_file,
            parsing_status=Resume.ParsingStatus.PENDING,
        )

        result = parse_resume_task(resume.id)
        self.assertEqual(result['status'], 'completed')

        resume.refresh_from_db()
        self.assertEqual(resume.parsing_status, Resume.ParsingStatus.COMPLETED)
        self.assertEqual(resume.parsed_data['email'], 'abebe.molla@aau.edu.et')
        self.assertEqual(resume.parsed_data['phone'], '+251712345678')
        self.assertEqual(resume.parsed_data['github_url'], 'https://github.com/abebemolla')
        self.assertEqual(resume.parsed_data['gpa'], 3.75)
        self.assertEqual(resume.parsed_data['education']['field_of_study'], 'Computer Science')
        self.assertIn('Python', resume.parsed_data['skills'])
        self.assertIn('PostgreSQL', resume.parsed_data['skills'])

    def test_resume_status_endpoint(self):
        """Polling status endpoint returns parsing status and extracted data."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from apps.students.models import Resume

        pdf_bytes = self._create_test_pdf_bytes("Sample Resume Content")
        uploaded_file = SimpleUploadedFile("resume.pdf", pdf_bytes, content_type="application/pdf")

        resume = Resume.objects.create(
            student=self.profile,
            file=uploaded_file,
            parsing_status=Resume.ParsingStatus.COMPLETED,
            parsed_data={"gpa": 3.9, "skills": ["Python", "Django"]},
            extracted_text="Sample Resume Content",
        )

        response = self.client.get(f'/api/v1/students/resume/status/{resume.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'COMPLETED')
        self.assertEqual(response.data['parsed_data']['gpa'], 3.9)
        self.assertEqual(response.data['extracted_text'], 'Sample Resume Content')

    def test_resume_status_forbidden_for_other_student(self):
        """A student cannot access another student's resume status."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from apps.students.models import StudentProfile, Resume

        User = get_user_model()
        other_user = User.objects.create_user(
            email='other_student@aau.edu.et',
            username='other_student',
            password='Password123!',
            role=User.Role.STUDENT,
        )
        other_profile = StudentProfile.objects.create(user=other_user)

        pdf_bytes = self._create_test_pdf_bytes("Other Student Content")
        uploaded_file = SimpleUploadedFile("resume.pdf", pdf_bytes, content_type="application/pdf")

        other_resume = Resume.objects.create(
            student=other_profile,
            file=uploaded_file,
            parsing_status=Resume.ParsingStatus.PENDING,
        )

        response = self.client.get(f'/api/v1/students/resume/status/{other_resume.id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_resume_upload_rejects_oversized_file(self):
        """Files exceeding 5MB are rejected with 400 Bad Request."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        # Create 5.5 MB payload
        large_content = b"%PDF-1.4\n" + b"0" * (6 * 1024 * 1024)
        large_file = SimpleUploadedFile("large_resume.pdf", large_content, content_type="application/pdf")

        response = self.client.post('/api/v1/students/resume/', {'file': large_file}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('5MB limit', response.data['detail'])

    def test_resume_upload_rejects_invalid_mime(self):
        """Executable / text file disguised as PDF is rejected with 400 Bad Request."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        fake_pdf = SimpleUploadedFile("fake.pdf", b"This is plain text without pdf header", content_type="application/pdf")
        response = self.client.post('/api/v1/students/resume/', {'file': fake_pdf}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Unsupported file format', response.data['detail'])


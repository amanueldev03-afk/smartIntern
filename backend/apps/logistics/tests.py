import uuid
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.students.models import Student
from apps.uil_profiles.models import UILStudentProfile
from apps.teams.models import InHouseCohort
from apps.logistics.models import CampusLogistics
from apps.logistics.tasks import expire_campus_logistics_sweep

User = get_user_model()


class CampusLogisticsWorkflowTests(APITestCase):
    """
    Unit and integration tests for the paperless campus logistics clearance state machine:
      - Step 1: UIL Officer placement
      - Step 2: Department Dean cryptographic digital sign-off (HMAC-SHA256)
      - Step 3: Student Union meal card activation
      - Step 4: Dormitory Admin room & key issuance (6-8 beds per room)
      - Celery expiration sweep for time-bounded clearance
    """

    def setUp(self):
        # 1. Users representing campus actors
        self.uil_officer = User.objects.create_user(
            email="uil.head@aau.edu.et",
            password="Password123!",
            role=User.Role.UIL_OFFICER,
            first_name="Ato",
            last_name="Tadesse",
            is_active=True,
        )
        self.dean = User.objects.create_user(
            email="dean.engineering@aau.edu.et",
            password="Password123!",
            role=User.Role.DEPT_DEAN,
            first_name="Dr.",
            last_name="Bekele",
            is_active=True,
        )
        self.student_union = User.objects.create_user(
            email="student.union@aau.edu.et",
            password="Password123!",
            role=User.Role.STUDENT_UNION,
            first_name="Union",
            last_name="President",
            is_active=True,
        )
        self.dorm_admin = User.objects.create_user(
            email="dorm.admin@aau.edu.et",
            password="Password123!",
            role=User.Role.DORM_ADMIN,
            first_name="Admin",
            last_name="Girma",
            is_active=True,
        )

        # 2. Student user, legacy Student & UILStudentProfile
        self.student_user = User.objects.create_user(
            email="alemayehu@aau.edu.et",
            password="Password123!",
            role=User.Role.STUDENT,
            first_name="Alemayehu",
            last_name="Tekle",
            is_active=True,
        )
        self.legacy_student = Student.objects.create(user=self.student_user)
        self.student_profile = UILStudentProfile.objects.create(
            student=self.legacy_student,
            student_id_number="AAU/SE/9991/12",
            campus_city="Addis Ababa",
            department="Software Engineering",
            academic_year=4,
            is_active_for_internship=True,
        )

        # 3. InHouseCohort
        self.cohort = InHouseCohort.objects.create(
            university_name="Addis Ababa University",
            academic_year="2023/2024",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=90),
            capacity_k=20,
            is_open=True,
        )

    def test_complete_four_step_clearance_workflow(self):
        """
        End-to-end execution:
          Step 1 -> Placement by UIL Officer
          Step 2 -> Cryptographic sign-off by Dean (HMAC-SHA256)
          Step 3 -> Meal card activation by Student Union
          Step 4 -> Dorm room & key issuance by Dorm Admin
        """
        # Step 1: UIL Officer marks student as placed in Track 1
        self.client.force_authenticate(user=self.uil_officer)
        placement_url = reverse("logistics:logistics-placement")
        placement_data = {
            "student_id": self.student_profile.student_id_number,
            "cohort_id": str(self.cohort.id),
        }
        resp1 = self.client.post(placement_url, placement_data, format="json")
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        logistics_id = resp1.data["id"]

        logistics = CampusLogistics.objects.get(id=logistics_id)
        self.assertTrue(logistics.uil_placed)
        self.assertFalse(logistics.dean_approved)
        self.assertEqual(logistics.dean_signature_hash, "")
        self.assertFalse(logistics.meal_card_active)
        self.assertFalse(logistics.key_issued)

        # Enforce gate: Student Union cannot activate meal card before Dean signs
        self.client.force_authenticate(user=self.student_union)
        meal_card_url = reverse("logistics:meal-card-activate", kwargs={"pk": logistics_id})
        fail_meal_resp = self.client.post(meal_card_url, {"meal_card_number": "MC-8812"}, format="json")
        self.assertEqual(fail_meal_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Dean", fail_meal_resp.data["detail"])

        # Enforce gate: Dorm Admin cannot assign dorm or issue key before Dean signs
        self.client.force_authenticate(user=self.dorm_admin)
        dorm_assign_url = reverse("logistics:dorm-assign", kwargs={"pk": logistics_id})
        fail_dorm_resp = self.client.post(
            dorm_assign_url,
            {"dorm_block": "Block B", "dorm_room": "104", "dorm_bed_number": "Bed 1", "issue_key": True},
            format="json",
        )
        self.assertEqual(fail_dorm_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Dean", fail_dorm_resp.data["detail"])

        # Step 2: Department Dean executes cryptographic digital sign-off
        self.client.force_authenticate(user=self.dean)
        dean_sign_url = reverse("logistics:dean-sign", kwargs={"pk": logistics_id})
        resp2 = self.client.post(dean_sign_url, {}, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertTrue(resp2.data["dean_approved"])
        self.assertTrue(resp2.data["signature_verified"])
        self.assertTrue(len(resp2.data["dean_signature_hash"]) > 0)

        logistics.refresh_from_db()
        self.assertTrue(logistics.dean_approved)
        self.assertTrue(logistics.verify_dean_signature())
        self.assertEqual(logistics.dean_signed_by, self.dean)

        # Enforce gate: Dorm Admin cannot assign dorm or issue key before Student Union activates meal card
        self.client.force_authenticate(user=self.dorm_admin)
        fail_dorm_no_union = self.client.post(
            dorm_assign_url,
            {"dorm_block": "Block C", "dorm_room": "302", "dorm_bed_number": "Bed 2", "issue_key": True},
            format="json",
        )
        self.assertEqual(fail_dorm_no_union.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("meal card", fail_dorm_no_union.data["detail"].lower())

        # Step 3: Student Union views approved queue and activates meal card
        self.client.force_authenticate(user=self.student_union)
        queue_url = reverse("logistics:meal-card-queue")
        queue_resp = self.client.get(queue_url)
        self.assertEqual(queue_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(queue_resp.data), 1)
        self.assertEqual(queue_resp.data[0]["id"], str(logistics.id))

        resp3 = self.client.post(meal_card_url, {"meal_card_number": "MC-2024-AAU-001"}, format="json")
        self.assertEqual(resp3.status_code, status.HTTP_200_OK)
        self.assertTrue(resp3.data["meal_card_active"])
        self.assertEqual(resp3.data["meal_card_number"], "MC-2024-AAU-001")

        logistics.refresh_from_db()
        self.assertTrue(logistics.meal_card_active)
        self.assertEqual(logistics.meal_card_number, "MC-2024-AAU-001")

        # Step 4: Dormitory Admin views room grid, assigns room & bed, issues key
        self.client.force_authenticate(user=self.dorm_admin)
        grid_url = reverse("logistics:dorm-room-grid")
        grid_resp_before = self.client.get(grid_url)
        self.assertEqual(grid_resp_before.status_code, status.HTTP_200_OK)

        resp4 = self.client.post(
            dorm_assign_url,
            {"dorm_block": "Block C", "dorm_room": "302", "dorm_bed_number": "Bed 2", "issue_key": True},
            format="json",
        )
        self.assertEqual(resp4.status_code, status.HTTP_200_OK)
        self.assertTrue(resp4.data["key_issued"])
        self.assertEqual(resp4.data["dorm_status"], "KEY_ISSUED")
        self.assertEqual(resp4.data["dorm_block"], "Block C")
        self.assertEqual(resp4.data["dorm_room"], "302")
        self.assertEqual(resp4.data["dorm_bed_number"], "Bed 2")

        logistics.refresh_from_db()
        self.assertTrue(logistics.key_issued)
        self.assertEqual(logistics.dorm_status, CampusLogistics.DormStatus.KEY_ISSUED)

        # Check room grid now reflects occupied bed (1/8)
        grid_resp_after = self.client.get(grid_url)
        self.assertEqual(grid_resp_after.status_code, status.HTTP_200_OK)
        rooms = grid_resp_after.data["rooms"]
        self.assertEqual(len(rooms), 1)
        self.assertEqual(rooms[0]["room"], "302")
        self.assertEqual(rooms[0]["occupied_beds"], 1)
        self.assertEqual(rooms[0]["bed_capacity"], 8)

        # Step 5: Key Return upon clearance at exit
        return_url = reverse("logistics:dorm-return-key", kwargs={"pk": logistics_id})
        return_resp = self.client.post(return_url, {}, format="json")
        self.assertEqual(return_resp.status_code, status.HTTP_200_OK)
        self.assertFalse(return_resp.data["key_issued"])
        self.assertTrue(return_resp.data["cleared_at_exit"])
        self.assertEqual(return_resp.data["dorm_status"], "RETURNED")

    def test_celery_expiration_sweep_deactivates_cards_and_updates_dorm(self):
        """
        Verify: If current_date > valid_until, Celery task sets:
          - meal_card_active = False
          - dorm_status = 'PENDING_KEY_RETURN'
        """
        yesterday = timezone.now().date() - timedelta(days=1)
        two_months_ago = yesterday - timedelta(days=60)

        # Student with expired validity
        expired_logistics = CampusLogistics.objects.create(
            student=self.student_profile,
            cohort=self.cohort,
            dean_approved=True,
            meal_card_number="MC-EXPIRED-99",
            meal_card_active=True,
            dorm_block="Block A",
            dorm_room="101",
            dorm_bed_number="Bed 3",
            dorm_status=CampusLogistics.DormStatus.KEY_ISSUED,
            key_issued=True,
            valid_from=two_months_ago,
            valid_until=yesterday,
        )

        # Run Celery expiration sweep task synchronously
        result = expire_campus_logistics_sweep()
        self.assertEqual(result["status"], "COMPLETED")
        self.assertGreaterEqual(result["meal_cards_deactivated"], 1)
        self.assertGreaterEqual(result["keys_pending_return"], 1)

        expired_logistics.refresh_from_db()
        self.assertFalse(expired_logistics.meal_card_active)
        self.assertEqual(expired_logistics.dorm_status, CampusLogistics.DormStatus.PENDING_KEY_RETURN)

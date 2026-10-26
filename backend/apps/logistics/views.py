import logging
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from apps.uil_profiles.models import UILStudentProfile
from apps.teams.models import InHouseCohort
from .models import CampusLogistics
from .serializers import (
    CampusLogisticsSerializer,
    UILPlacementSerializer,
    MealCardActivationSerializer,
    DormAssignmentSerializer,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def check_role_permission(user, allowed_roles: list) -> bool:
    """Helper to check if user has any of the allowed roles or is staff/admin."""
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    return getattr(user, "role", None) in allowed_roles


class CampusLogisticsListView(generics.ListAPIView):
    """
    GET: List campus logistics clearance records with multi-dimensional filtering.
    """
    serializer_class = CampusLogisticsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role_upper = str(getattr(user, "role", "")).upper()

        qs = CampusLogistics.objects.select_related("student", "cohort").all()

        if role_upper == "STUDENT":
            return qs.filter(
                Q(student__student__user=user)
                | Q(student__student_id_number=str(getattr(user, "student_id_number", "")))
            )

        cohort_id = self.request.query_params.get("cohort_id")
        if cohort_id:
            qs = qs.filter(cohort_id=cohort_id)

        dean_approved = self.request.query_params.get("dean_approved")
        if dean_approved is not None:
            qs = qs.filter(dean_approved=dean_approved.lower() in ("true", "1"))

        meal_card_active = self.request.query_params.get("meal_card_active")
        if meal_card_active is not None:
            qs = qs.filter(meal_card_active=meal_card_active.lower() in ("true", "1"))

        key_issued = self.request.query_params.get("key_issued")
        if key_issued is not None:
            qs = qs.filter(key_issued=key_issued.lower() in ("true", "1"))

        dorm_block = self.request.query_params.get("dorm_block")
        if dorm_block:
            qs = qs.filter(dorm_block__iexact=dorm_block)

        dorm_room = self.request.query_params.get("dorm_room")
        if dorm_room:
            qs = qs.filter(dorm_room__iexact=dorm_room)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(student__student_id_number__icontains=search)
                | Q(student__student__user__first_name__icontains=search)
                | Q(student__student__user__last_name__icontains=search)
                | Q(student__student__user__email__icontains=search)
                | Q(student__department__icontains=search)
                | Q(meal_card_number__icontains=search)
            )

        return qs


class CampusLogisticsDetailView(generics.RetrieveAPIView):
    """
    GET: Retrieve details of a specific student's campus logistics status.
    """
    queryset = CampusLogistics.objects.all()
    serializer_class = CampusLogisticsSerializer
    permission_classes = [permissions.IsAuthenticated]


class CampusLogisticsPlacementView(generics.GenericAPIView):
    """
    Step 1: UIL Officer marks student as placed in Track 1 on-campus.
    POST /api/v1/logistics/placement/
    """
    serializer_class = UILPlacementSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if not check_role_permission(request.user, [User.Role.UIL_OFFICER, User.Role.ADMIN]):
            return Response(
                {"detail": "Only University-Industry Linkage (UIL) Officers can initiate Track 1 campus logistics placement."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        student_query = data["student_id"]
        # Find UILStudentProfile by UUID, student_id_number, or user email
        profile = UILStudentProfile.objects.filter(
            Q(id__exact=student_query if len(student_query) == 36 else None)
            | Q(student_id_number__iexact=student_query)
            | Q(student__user__email__iexact=student_query)
        ).first()

        if not profile:
            # Fallback: check legacy Student or User
            from apps.students.models import Student
            student_obj = Student.objects.filter(
                Q(user__email__iexact=student_query)
                | Q(user__student_profile__student_id_number__iexact=student_query)
            ).first()
            if student_obj:
                profile = UILStudentProfile.objects.filter(student=student_obj).first()
                if not profile:
                    profile = UILStudentProfile.objects.create(
                        student=student_obj,
                        student_id_number=student_query,
                        campus_city="Addis Ababa",
                        department="Software Engineering",
                        academic_year=4,
                    )

        if not profile:
            user_obj = User.objects.filter(
                Q(email__iexact=student_query)
                | Q(student_profile__student_id_number__iexact=student_query)
            ).first()
            if user_obj:
                from apps.students.models import Student
                student_obj, _ = Student.objects.get_or_create(user=user_obj)
                profile, _ = UILStudentProfile.objects.get_or_create(
                    student=student_obj,
                    defaults={
                        "student_id_number": student_query,
                        "campus_city": "Addis Ababa",
                        "department": "Software Engineering",
                        "academic_year": 4,
                    }
                )

        if not profile:
            return Response(
                {"detail": f"UILStudentProfile matching '{student_query}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            cohort = InHouseCohort.objects.get(id=data["cohort_id"])
        except InHouseCohort.DoesNotExist:
            return Response(
                {"detail": f"Cohort with ID '{data['cohort_id']}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        from django.utils import timezone
        valid_from = data.get("valid_from") or cohort.start_date
        valid_until = data.get("valid_until") or cohort.end_date

        logistics, created = CampusLogistics.objects.get_or_create(
            student=profile,
            defaults={
                "cohort": cohort,
                "uil_placed": True,
                "uil_placed_by": request.user,
                "uil_placed_at": timezone.now(),
                "valid_from": valid_from,
                "valid_until": valid_until,
            },
        )
        if not created:
            logistics.cohort = cohort
            logistics.uil_placed = True
            logistics.uil_placed_by = request.user
            logistics.uil_placed_at = timezone.now()
            logistics.valid_from = valid_from
            logistics.valid_until = valid_until
            logistics.save()

        return Response(
            CampusLogisticsSerializer(logistics).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class DeanSignOffView(generics.GenericAPIView):
    """
    Step 2: Department Dean executes cryptographic digital sign-off.
    POST /api/v1/logistics/<id>/dean-sign/
    """
    queryset = CampusLogistics.objects.all()
    serializer_class = CampusLogisticsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        if not check_role_permission(request.user, [User.Role.DEPT_DEAN, User.Role.ADMIN]):
            return Response(
                {"detail": "Only the Department Dean can execute cryptographic digital sign-off."},
                status=status.HTTP_403_FORBIDDEN,
            )

        logistics = self.get_object()
        if not logistics.uil_placed:
            return Response(
                {"detail": "Cannot execute Dean digital sign-off before student has been placed by UIL Officer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logistics.sign_dean_clearance(request.user)
        logger.info(
            f"Dean {request.user.email} digitally signed logistics clearance for student "
            f"{logistics.student.student_id_number} (hash={logistics.dean_signature_hash[:16]}...)"
        )

        return Response(
            CampusLogisticsSerializer(logistics).data,
            status=status.HTTP_200_OK,
        )


class MealCardQueueView(generics.ListAPIView):
    """
    Step 3 Queue: Student Union views the queue of Dean-approved students.
    GET /api/v1/logistics/meal-cards/
    """
    serializer_class = CampusLogisticsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Must be approved by Dean
        qs = CampusLogistics.objects.filter(dean_approved=True).select_related("student", "cohort")

        active = self.request.query_params.get("active")
        if active is not None:
            qs = qs.filter(meal_card_active=active.lower() in ("true", "1"))

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(student__student_id_number__icontains=search)
                | Q(student__student__user__first_name__icontains=search)
                | Q(student__student__user__last_name__icontains=search)
                | Q(student__student__user__email__icontains=search)
                | Q(student__department__icontains=search)
                | Q(meal_card_number__icontains=search)
            )

        return qs


class MealCardActivationView(generics.GenericAPIView):
    """
    Step 3 Action: Student Union enters meal card number, activating dining access.
    POST /api/v1/logistics/<id>/activate-meal-card/
    """
    queryset = CampusLogistics.objects.all()
    serializer_class = MealCardActivationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        if not check_role_permission(request.user, [User.Role.STUDENT_UNION, User.Role.ADMIN]):
            return Response(
                {"detail": "Only Student Union officers can issue and activate meal cards."},
                status=status.HTTP_403_FORBIDDEN,
            )

        logistics = self.get_object()
        if not logistics.dean_approved:
            return Response(
                {"detail": "Cannot activate meal card without prior Department Dean digital sign-off."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        card_number = serializer.validated_data["meal_card_number"].strip()

        # Check if meal card number is already assigned to another active student
        conflict = CampusLogistics.objects.filter(
            meal_card_number=card_number,
            meal_card_active=True,
        ).exclude(id=logistics.id)
        if conflict.exists():
            return Response(
                {"detail": f"Meal card number '{card_number}' is already active for another student."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logistics.activate_meal_card(card_number=card_number, issued_by_user=request.user)

        # Generate Student Union cryptographic hash and Base64 QR code confirmation
        import hmac
        import hashlib
        import json
        from django.conf import settings
        from apps.common.qr_generator import generate_base64_qr

        msg = f"UNION_MEAL_CARD:{logistics.student.student_id_number}:{card_number}:{request.user.id}"
        union_hash = hmac.new(settings.SECRET_KEY.encode(), msg.encode(), hashlib.sha256).hexdigest()
        union_qr_data = json.dumps({
            "doc_type": "STUDENT_UNION_MEAL_CONFIRMATION",
            "student_id": logistics.student.student_id_number,
            "student_name": logistics.student.user.full_name if logistics.student.user else logistics.student.student_id_number,
            "meal_card_number": card_number,
            "status": "ACTIVE",
            "union_signature": union_hash,
        })
        logistics.student_union_signature_hash = union_hash
        logistics.student_union_qr_code = generate_base64_qr(union_qr_data)
        if request.data.get("meal_card_appointment"):
            logistics.meal_card_appointment = request.data["meal_card_appointment"]
        logistics.save()

        logger.info(
            f"Meal card {card_number} activated for {logistics.student.student_id_number} by {request.user.email}"
        )

        return Response(
            CampusLogisticsSerializer(logistics).data,
            status=status.HTTP_200_OK,
        )


class DormRoomGridView(generics.GenericAPIView):
    """
    Step 4 Grid: Dormitory Admin views residential room grid with bed capacity (6-8 beds per room),
    occupancy, and key checkout status.
    GET /api/v1/logistics/dorm-rooms/
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        block_filter = request.query_params.get("block")

        # Query all active assignments
        qs = CampusLogistics.objects.filter(
            dorm_block__gt="",
            dorm_room__gt="",
        ).select_related("student", "cohort")

        if block_filter:
            qs = qs.filter(dorm_block__iexact=block_filter)

        # Aggregate room occupancy
        rooms_dict = {}
        # Predefined default room bed capacity is 8 (6 to 8 beds per room)
        BED_CAPACITY = 8

        for record in qs:
            key = (record.dorm_block, record.dorm_room)
            if key not in rooms_dict:
                rooms_dict[key] = {
                    "block": record.dorm_block,
                    "room": record.dorm_room,
                    "bed_capacity": BED_CAPACITY,
                    "occupied_beds": 0,
                    "occupants": [],
                }
            rooms_dict[key]["occupied_beds"] += 1
            student_name = ""
            user = getattr(record, "user", None) or getattr(record.student, "user", None)
            if user:
                student_name = getattr(user, "full_name", "") or user.get_full_name() or user.email
            if not student_name:
                student_name = getattr(record.student, "student_id_number", "Student")

            rooms_dict[key]["occupants"].append({
                "student_id": record.student.student_id_number,
                "student_name": student_name,
                "bed_number": record.dorm_bed_number,
                "key_issued": record.key_issued,
                "key_issued_at": record.key_issued_at,
                "dorm_status": record.dorm_status,
                "logistics_id": str(record.id),
            })

        rooms_list = sorted(list(rooms_dict.values()), key=lambda r: (r["block"], r["room"]))
        return Response(
            {
                "rooms": rooms_list,
                "total_rooms_with_occupants": len(rooms_list),
            },
            status=status.HTTP_200_OK,
        )


class DormAssignmentView(generics.GenericAPIView):
    """
    Step 4 Action: Dormitory Admin assigns room & bed number (6-8 beds per room) and issues key.
    POST /api/v1/logistics/<id>/assign-dorm/
    """
    queryset = CampusLogistics.objects.all()
    serializer_class = DormAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        if not check_role_permission(request.user, [User.Role.DORM_ADMIN, User.Role.ADMIN]):
            return Response(
                {"detail": "Only Dormitory Administrators can assign dormitory rooms and issue keys."},
                status=status.HTTP_403_FORBIDDEN,
            )

        logistics = self.get_object()
        if not logistics.dean_approved:
            return Response(
                {"detail": "Cannot assign dormitory room or issue keys without prior Department Dean digital sign-off."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not logistics.meal_card_active or not logistics.meal_card_number:
            return Response(
                {"detail": "Cannot assign dormitory room or issue keys before Student Union has issued and activated the student's meal card."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.now().date()
        if logistics.valid_until and logistics.valid_until < today:
            return Response(
                {"detail": f"Logistics clearance window has expired on {logistics.valid_until}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        block = serializer.validated_data["dorm_block"].strip()
        room = serializer.validated_data["dorm_room"].strip()
        bed = serializer.validated_data["dorm_bed_number"].strip()
        issue_key = serializer.validated_data.get("issue_key", True)

        # Check room capacity (max 8 beds per room)
        existing_in_room = CampusLogistics.objects.filter(
            dorm_block__iexact=block,
            dorm_room__iexact=room,
        ).exclude(id=logistics.id)

        if existing_in_room.count() >= 8:
            return Response(
                {"detail": f"Room '{room}' in Block '{block}' has reached maximum capacity (8/8 beds occupied)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if bed number is already taken in this room
        if existing_in_room.filter(dorm_bed_number__iexact=bed).exists():
            return Response(
                {"detail": f"Bed '{bed}' in Room '{room}' (Block '{block}') is already occupied."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logistics.assign_dorm_and_key(
            block=block,
            room=room,
            bed=bed,
            issued_by_user=request.user,
            issue_key=issue_key,
        )
        logger.info(
            f"Dorm assigned: Block {block} Room {room} Bed {bed} (key_issued={issue_key}) for "
            f"{logistics.student.student_id_number} by {request.user.email}"
        )

        return Response(
            CampusLogisticsSerializer(logistics).data,
            status=status.HTTP_200_OK,
        )


class DormKeyReturnView(generics.GenericAPIView):
    """
    Conclusion / Exit clearance: Student returns dormitory key.
    POST /api/v1/logistics/<id>/return-key/
    """
    queryset = CampusLogistics.objects.all()
    serializer_class = CampusLogisticsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        if not check_role_permission(request.user, [User.Role.DORM_ADMIN, User.Role.ADMIN]):
            return Response(
                {"detail": "Only Dormitory Administrators can record key returns and exit clearance."},
                status=status.HTTP_403_FORBIDDEN,
            )

        logistics = self.get_object()
        from django.utils import timezone
        now = timezone.now()
        logistics.return_dorm_key()
        logistics.room_checkout = True
        logistics.room_checkout_at = now
        logistics.save(update_fields=["room_checkout", "room_checkout_at"])
        logger.info(f"Dorm key returned for student {logistics.student.student_id_number}")

        return Response(
            CampusLogisticsSerializer(logistics).data,
            status=status.HTTP_200_OK,
        )


class DormCheckoutToggleView(generics.GenericAPIView):
    """
    Dormitory Admin toggles the room checkout checkbox on exit or deadline.
    POST /api/v1/logistics/<id>/checkout/
    """
    queryset = CampusLogistics.objects.all()
    serializer_class = CampusLogisticsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        if not check_role_permission(request.user, [User.Role.DORM_ADMIN, User.Role.ADMIN]):
            return Response(
                {"detail": "Only Dormitory Administrators can toggle exit checkout."},
                status=status.HTTP_403_FORBIDDEN,
            )

        logistics = self.get_object()
        from django.utils import timezone
        is_checkout = request.data.get("checkout", True)
        logistics.room_checkout = bool(is_checkout)
        logistics.room_checkout_at = timezone.now() if is_checkout else None
        if is_checkout:
            logistics.key_issued = False
            logistics.dorm_status = CampusLogistics.DormStatus.RETURNED
            logistics.cleared_at_exit = True
        logistics.save()

        return Response(
            CampusLogisticsSerializer(logistics).data,
            status=status.HTTP_200_OK,
        )


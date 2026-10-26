from django.utils import timezone
from rest_framework import serializers
from .models import Internship


def validate_internship_is_available(internship):
    """
    Validate that an internship is available for student actions.
    
    Checks:
    - Internship status is ACTIVE
    - Application deadline has not passed (if set)
    
    Raises:
        serializers.ValidationError: If internship is not available.
    """
    if internship.status != Internship.STATUS_ACTIVE:
        raise serializers.ValidationError(
            "This internship is no longer available."
        )
    
    if (
        internship.application_deadline
        and internship.application_deadline <= timezone.now()
    ):
        raise serializers.ValidationError(
            "The application deadline for this internship has passed."
        )
    
    return internship

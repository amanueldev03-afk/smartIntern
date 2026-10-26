import django_filters
from django.db.models import Q

from .models import Internship


class InternshipFilter(django_filters.FilterSet):
    """
    Filters for active and verified internships.
    """

    country = django_filters.CharFilter(
        field_name="country",
        lookup_expr="icontains",
    )

    city = django_filters.CharFilter(
        field_name="city",
        lookup_expr="icontains",
    )

    location = django_filters.CharFilter(
        method="filter_location",
    )

    category = django_filters.CharFilter(
        field_name="category",
        lookup_expr="icontains",
    )

    type = django_filters.ChoiceFilter(
        field_name="internship_type",
        choices=Internship.INTERNSHIP_TYPE_CHOICES,
    )

    work_mode = django_filters.ChoiceFilter(
        field_name="work_mode",
        choices=Internship._meta.get_field("work_mode").choices,
    )

    work_type = django_filters.ChoiceFilter(
        choices=Internship.WORK_TYPE_CHOICES,
    )

    experience = django_filters.CharFilter(
        field_name="required_experience",
        lookup_expr="icontains",
    )

    internship_type = django_filters.ChoiceFilter(
        choices=Internship.INTERNSHIP_TYPE_CHOICES,
    )

    compensation_type = django_filters.ChoiceFilter(
        choices=Internship.COMPENSATION_TYPE_CHOICES,
    )

    minimum_compensation = django_filters.NumberFilter(
        field_name="minimum_compensation",
        lookup_expr="gte",
    )

    maximum_compensation = django_filters.NumberFilter(
        field_name="maximum_compensation",
        lookup_expr="lte",
    )

    duration_min_weeks = django_filters.NumberFilter(
        field_name="duration_min_weeks",
        lookup_expr="gte",
    )

    duration_max_weeks = django_filters.NumberFilter(
        field_name="duration_max_weeks",
        lookup_expr="lte",
    )

    skill = django_filters.CharFilter(
        method="filter_skill",
    )

    def filter_location(self, queryset, name, value):
        lookup = Q(country__icontains=value) | Q(
            city__icontains=value) | Q(location_text__icontains=value)
        return queryset.filter(lookup)

    def filter_skill(self, queryset, name, value):
        """
        Filter internships whose required_skills contain
        the requested skill.
        """

        return queryset.filter(
            required_skills__icontains=value
        )

    class Meta:
        model = Internship

        fields = [
            "country",
            "city",
            "location",
            "category",
            "type",
            "work_mode",
            "internship_type",
            "work_type",
            "experience",
            "compensation_type",
            "minimum_compensation",
            "maximum_compensation",
            "duration_min_weeks",
            "duration_max_weeks",
        ]

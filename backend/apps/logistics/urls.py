from django.urls import path
from .views import (
    CampusLogisticsListView,
    CampusLogisticsDetailView,
    CampusLogisticsPlacementView,
    DeanSignOffView,
    MealCardQueueView,
    MealCardActivationView,
    DormRoomGridView,
    DormAssignmentView,
    DormKeyReturnView,
    DormCheckoutToggleView,
)

app_name = "logistics"

urlpatterns = [
    path("", CampusLogisticsListView.as_view(), name="logistics-list"),
    path("<uuid:pk>/", CampusLogisticsDetailView.as_view(), name="logistics-detail"),
    path("placement/", CampusLogisticsPlacementView.as_view(), name="logistics-placement"),
    path("<uuid:pk>/dean-sign/", DeanSignOffView.as_view(), name="dean-sign"),
    path("meal-cards/", MealCardQueueView.as_view(), name="meal-card-queue"),
    path("<uuid:pk>/activate-meal-card/", MealCardActivationView.as_view(), name="meal-card-activate"),
    path("dorm-rooms/", DormRoomGridView.as_view(), name="dorm-room-grid"),
    path("<uuid:pk>/assign-dorm/", DormAssignmentView.as_view(), name="dorm-assign"),
    path("<uuid:pk>/return-key/", DormKeyReturnView.as_view(), name="dorm-return-key"),
    path("<uuid:pk>/checkout/", DormCheckoutToggleView.as_view(), name="dorm-checkout"),
]

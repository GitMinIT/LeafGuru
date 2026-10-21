"""LeafGuru URL configuration (phase 1 shell)."""

from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path

from core import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", views.dashboard, name="dashboard"),
    path("grows/", views.grows, name="grows"),
    path("plants/", views.plants, name="plants"),
    path("locations/", views.locations, name="locations"),
    path("equipment/", views.equipment, name="equipment"),
    path("strains/", views.strains, name="strains"),
    path("tasks/", views.tasks, name="tasks"),
    path("timeline/", views.timeline, name="timeline"),
    path("history/", views.history, name="history"),
    path("settings/", views.settings, name="settings"),
    path("data/", views.data, name="data"),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])
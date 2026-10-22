"""LeafGuru URL configuration.

The API lives under /api/v1/. The page routes are unchanged, so the
browser app keeps working whether it talks to the local adapter or to
the server.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path

from core import auth_views, invite_views, views
from core.api import api

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", api.urls),
    path("login/", auth_views.login_view, name="login"),
    path("logout/", auth_views.logout_view, name="logout"),
    path("invite/<str:token>/", invite_views.accept_invite_view, name="accept_invite"),
    path("", views.today, name="today"),
    path("today/", views.today, name="today_alias"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("grows/", views.grows, name="grows"),
    path("plants/", views.plants, name="plants"),
    path("locations/", views.locations, name="locations"),
    path("equipment/", views.equipment, name="equipment"),
    path("strains/", views.strains, name="strains"),
    path("tasks/", views.tasks, name="tasks"),
    path("timeline/", views.timeline, name="timeline"),
    path("sensors/", views.sensors, name="sensors"),
    path("history/", views.history, name="history"),
    path("settings/", views.settings, name="settings"),
    path("data/", views.data, name="data"),
]

# Uploaded photos (server mode). Always served: the workspace check
# happens in the API, the file names are random UUIDs.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])

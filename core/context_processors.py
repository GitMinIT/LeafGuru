"""
LeafGuru — context processors.

Small helpers the templates need on every page:

  auth_required  -> the deployment needs accounts
  auth_user      -> the signed-in user (or None)
  repo_url       -> where the source lives (the topbar GitHub link)
  pompui_home_url / pompui_impressum_url -> the POMPUI integration
"""
from django.conf import settings


def leafguru_auth(request):
    return {
        "auth_required": bool(getattr(settings, "AUTH_REQUIRED", False)),
        "auth_user": getattr(request, "user", None),
        "repo_url": getattr(settings, "REPO_URL", ""),
        "pompui_home_url": getattr(settings, "POMPUI_URL", ""),
        "pompui_impressum_url": getattr(settings, "POMPUI_IMPRESSUM_URL", ""),
    }

"""
LeafGuru — context processors.

Small helpers the templates need on every page:

  auth_required  -> the deployment needs accounts
  auth_user      -> the signed-in user (or None)
"""
from django.conf import settings


def leafguru_auth(request):
    return {
        "auth_required": bool(getattr(settings, "AUTH_REQUIRED", False)),
        "auth_user": getattr(request, "user", None),
    }

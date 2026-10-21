"""
LeafGuru — authentication & workspace resolution.

The deployment mode decides everything:

  LEAFGURU_AUTH=none      no accounts. The server owns workspaces that
                           everyone on the instance shares. Right for
                           self-hosting on a LAN.
  LEAFGURU_AUTH=required  every request must be authenticated; each
                           account owns its workspaces. Right for the
                           hosted service.

There is no open self-sign-up: the hosted service creates the account
for the customer.

A **workspace** is the server-side counterpart of a browser data
profile: an independent set of grow data. The client picks one per
request (the "X-LeafGuru-Workspace" header or a ?workspace= query
parameter); without a hint the account's default workspace is used.
"""
import uuid

from django.contrib.auth import authenticate, get_user_model
from django.core.exceptions import PermissionDenied
from django.db import transaction

from .models import Workspace

#: header the client uses to select the workspace
WORKSPACE_HEADER = "X-LeafGuru-Workspace"


def auth_required():
    """True when the deployment needs accounts."""
    from django.conf import settings

    return bool(getattr(settings, "AUTH_REQUIRED", False))


def shared_workspace():
    """The default workspace used in auth mode 'none'."""
    from django.conf import settings

    name = getattr(settings, "SHARED_WORKSPACE_NAME", "Default")
    workspace, _ = Workspace.objects.get_or_create(
        owner=None, name=name, defaults={"id": uuid.uuid4()}
    )
    return workspace


def workspace_for_user(user):
    """The default workspace of a logged-in user (created on first use)."""
    if user is None or not getattr(user, "is_authenticated", False):
        return shared_workspace()
    workspace, _ = Workspace.objects.get_or_create(
        owner=user, name="Default", defaults={"id": uuid.uuid4()}
    )
    return workspace


def requested_workspace_id(request):
    """The workspace the client asked for, if any."""
    header = ""
    try:
        header = request.headers.get(WORKSPACE_HEADER, "")
    except Exception:
        header = ""
    value = (header or request.GET.get("workspace", "")).strip()
    return value or None


def current_workspace(request):
    """
    The workspace the request operates on.

    In auth mode 'none' every workspace on the instance is shared, so
    the client may pick any of them. In auth mode 'required' only the
    signed-in account's own workspaces are reachable.
    """
    wanted = requested_workspace_id(request)

    if not auth_required():
        if wanted:
            workspace = Workspace.objects.filter(pk=wanted).first()
            if workspace is not None:
                return workspace
        return shared_workspace()

    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        raise PermissionDenied("authentication required")
    if wanted:
        workspace = Workspace.objects.filter(pk=wanted, owner=user).first()
        if workspace is not None:
            return workspace
    return workspace_for_user(user)


def list_workspaces(request):
    """The workspaces the caller may use."""
    if not auth_required():
        return list(Workspace.objects.filter(owner=None).order_by("created_at", "name"))
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        raise PermissionDenied("authentication required")
    return list(Workspace.objects.filter(owner=user).order_by("created_at", "name"))


@transaction.atomic
def create_workspace(request, name):
    """Create a workspace the caller owns (or a shared one)."""
    clean = str(name or "").strip()
    if not clean:
        raise ValueError("workspace name is required")
    if auth_required():
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            raise PermissionDenied("authentication required")
        owner = user
    else:
        owner = None
    workspace = Workspace.objects.create(
        id=uuid.uuid4(), name=clean, owner=owner
    )
    return workspace


@transaction.atomic
def create_account(username, email, password, is_staff=False, workspace_name="Default"):
    """
    Create an account + its default workspace.

    Used by the hosted service (the operator creates the account for the
    customer) and by the `manage.py create_account` command for
    self-hosters who want accounts on their own instance.
    """
    user_model = get_user_model()
    user = user_model.objects.create_user(
        username=username, email=email, password=password
    )
    if is_staff:
        user.is_staff = True
        user.save(update_fields=["is_staff"])
    workspace, _ = Workspace.objects.get_or_create(
        owner=user, name=workspace_name, defaults={"id": uuid.uuid4()}
    )
    return user, workspace


def authenticate_user(request, username, password):
    """Verify credentials. Returns the user or None."""
    user = authenticate(request, username=username, password=password)
    if user is None and "@" in (username or ""):
        # allow the email address as the login name
        user_model = get_user_model()
        candidate = user_model.objects.filter(email__iexact=username).first()
        if candidate is not None:
            user = authenticate(request, username=candidate.username, password=password)
    return user

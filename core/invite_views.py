"""
LeafGuru — invitation views (invite-only account creation).

The operator issues an invitation; the customer opens the link and sets
their OWN password. Nothing is ever sent by mail from the app — the
operator copies the link (or mails it themselves). The flow is the same
either way, and no mail configuration is needed to run LeafGuru.

Route: /invite/<token>/
"""

from django.contrib.auth import login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect

from .auth import auth_required, create_account
from .models import Invitation


@csrf_protect
def accept_invite_view(request, token):
    """
    Activate an account from an invitation link.

    GET  -> the form (set a password)
    POST -> create the account, mark the invitation used, sign the user in
    """
    if not auth_required():
        return HttpResponseRedirect(reverse("dashboard"))

    invite = Invitation.objects.filter(token=token).first()
    if invite is None or not invite.is_valid:
        return render(request, "core/invite.html", {"expired": True})

    error = None
    if request.method == "POST":
        password = request.POST.get("password") or ""
        password2 = request.POST.get("password2") or ""
        if password != password2:
            error = "The passwords do not match."
        elif len(password) < 8:
            error = "The password must be at least 8 characters."
        else:
            try:
                validate_password(password)
            except ValidationError as exc:
                error = " ".join(exc.messages)
            else:
                user, _workspace = create_account(
                    username=invite.username,
                    email=invite.email,
                    password=password,
                    workspace_name=invite.workspace_name,
                )
                invite.used_at = timezone.now()
                invite.save(update_fields=["used_at"])
                login(request, user)
                return HttpResponseRedirect(reverse("dashboard"))

    return render(
        request,
        "core/invite.html",
        {"invite": invite, "error": error, "expired": False},
    )

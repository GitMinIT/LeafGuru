"""
LeafGuru — account views.

Only used when LEAFGURU_AUTH=required (the hosted service). There is
NO self-sign-up: the service creates the account for the customer.

In LEAFGURU_AUTH=none mode these views redirect to the dashboard —
there is nothing to log into.
"""
from django.contrib.auth import login, logout
from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.csrf import csrf_protect

from .auth import (
    auth_required,
    authenticate_user,
    clear_login_failures,
    login_locked_out,
    record_login_failure,
)


def _safe_next(request):
    """
    The redirect target after a successful sign-in, or None.

    The value comes from the query string, so it is attacker
    controlled: an unchecked redirect to another host would send a
    user who just typed their password to a phishing page. Only a
    path on this host is accepted.
    """
    candidate = (request.GET.get("next") or "").strip()
    if not candidate:
        return None
    if not url_has_allowed_host_and_scheme(
        candidate,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return None
    return candidate


@csrf_protect
def login_view(request):
    """Sign in. Redirects to the dashboard when auth is disabled."""
    if not auth_required():
        return HttpResponseRedirect(reverse("dashboard"))

    error = None
    if request.method == "POST":
        username = (request.POST.get("username") or "").strip()
        password = request.POST.get("password") or ""

        if login_locked_out(request, username):
            error = (
                "Too many failed attempts. Try again in a few minutes."
            )
        else:
            user = authenticate_user(request, username, password)
            if user is not None:
                clear_login_failures(request, username)
                login(request, user)
                target = _safe_next(request) or reverse("dashboard")
                return HttpResponseRedirect(target)
            record_login_failure(request, username)
            error = "Wrong username or password."

    return render(
        request,
        "core/login.html",
        {"error": error, "next": _safe_next(request) or ""},
    )


def logout_view(request):
    """Sign out (a no-op when auth is disabled)."""
    if auth_required():
        logout(request)
    return HttpResponseRedirect(reverse("dashboard"))

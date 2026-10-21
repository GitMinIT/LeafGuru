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
from django.views.decorators.csrf import csrf_protect

from .auth import auth_required, authenticate_user


@csrf_protect
def login_view(request):
    """Sign in. Redirects to the dashboard when auth is disabled."""
    if not auth_required():
        return HttpResponseRedirect(reverse("dashboard"))

    error = None
    if request.method == "POST":
        username = (request.POST.get("username") or "").strip()
        password = request.POST.get("password") or ""
        user = authenticate_user(request, username, password)
        if user is not None:
            login(request, user)
            return HttpResponseRedirect(request.GET.get("next") or reverse("dashboard"))
        error = "Wrong username or password."

    return render(
        request,
        "core/login.html",
        {"error": error, "next": request.GET.get("next", "")},
    )


def logout_view(request):
    """Sign out (a no-op when auth is disabled)."""
    if auth_required():
        logout(request)
    return HttpResponseRedirect(reverse("dashboard"))

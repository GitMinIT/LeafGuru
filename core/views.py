"""Core app: app-shell views.

The pages are the app shell; all data is fetched by the client through
the storage adapter (IndexedDB locally, the REST API on a server). The
page views therefore only render HTML.

When the deployment needs accounts (LEAFGURU_AUTH=required), the pages
require a signed-in user as well — the API enforces that already, and
the shell follows.
"""

from django.shortcuts import render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme

from core.auth import auth_required

PAGES = {
    "grows": "Grows",
    "plants": "Plants",
    "locations": "Locations",
    "equipment": "Equipment",
    "strains": "Strain Templates",
    "tasks": "Tasks",
}


def _require_login(request):
    """
    Redirect to the login form when the deployment needs accounts and
    nobody is signed in. Returns a response to return instead of
    rendering, or None when the request may continue.
    """
    if not auth_required():
        return None
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        return None
    from django.shortcuts import redirect

    next_url = request.get_full_path()
    if not url_has_allowed_host_and_scheme(
        next_url, allowed_hosts={request.get_host()}, require_https=request.is_secure()
    ):
        next_url = reverse("dashboard")
    return redirect(f"{reverse('login')}?next={next_url}")


def _page(request, template, key):
    """Render a page with the context the shell needs (page key drives
    the active nav state and the body data-page attribute)."""
    blocked = _require_login(request)
    if blocked is not None:
        return blocked
    return render(request, template, {"page_key": key})


def dashboard(request):
    return _page(request, "core/dashboard.html", "dashboard")


def data(request):
    """Settings/data page: import, export, storage usage, danger zone."""
    return _page(request, "core/data.html", "data")


def timeline(request):
    """Timeline/calendar visualization: per-day events across entities."""
    return _page(request, "core/timeline.html", "timeline")


def history(request):
    """Per-grow event log: full history of one grow as a scrollable list."""
    return _page(request, "core/history.html", "history")


def settings(request):
    """Settings page: language, date format, timezone (browser-local)."""
    return _page(request, "core/settings.html", "settings")


def _entity_page(request, key):
    blocked = _require_login(request)
    if blocked is not None:
        return blocked
    ctx = {"entity_title": PAGES[key], "entity_key": key, "page_key": key}
    return render(request, f"core/{key}.html", ctx)


def grows(request):
    return _entity_page(request, "grows")


def plants(request):
    return _entity_page(request, "plants")


def locations(request):
    return _entity_page(request, "locations")


def equipment(request):
    return _entity_page(request, "equipment")


def strains(request):
    return _entity_page(request, "strains")


def tasks(request):
    return _entity_page(request, "tasks")

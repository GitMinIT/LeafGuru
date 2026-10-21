"""Core app: app-shell views. Phase 1 = local-first; all data lives in the
browser (IndexedDB). These views serve pages and static helpers only."""

from django.shortcuts import render

PAGES = {
    "grows": "Grows",
    "plants": "Plants",
    "locations": "Locations",
    "equipment": "Equipment",
    "strains": "Strain Templates",
    "tasks": "Tasks",
}


def _page(request, template, key):
    """Render a page with the context the shell needs (page key drives
    the active nav state and the body data-page attribute)."""
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

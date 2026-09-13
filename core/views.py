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


def dashboard(request):
    return render(request, "core/dashboard.html")


def data(request):
    """Settings/data page: import, export, storage usage, danger zone."""
    return render(request, "core/data.html")


def _entity_page(request, key):
    ctx = {"entity_title": PAGES[key], "entity_key": key}
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

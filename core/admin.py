"""
Django admin — the operator's back office for the hosted service.

Registering the models here lets the operator issue invitations and
inspect accounts/workspaces from /admin/ without using the command line.
"""
from django.contrib import admin

from core.models import Invitation, Workspace


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ["username", "email", "workspace_name", "created_at",
                    "expires_at", "used_at"]
    list_filter = ["used_at"]
    search_fields = ["username", "email", "token"]
    readonly_fields = ["token", "created_at", "used_at"]


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "created_at"]
    search_fields = ["name", "owner__username"]

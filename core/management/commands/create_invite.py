"""
Issue an invitation for the invite-only account flow.

The operator runs this, gets a link, and hands it to the customer. The
customer opens it and sets their OWN password — the operator never
handles the customer's password.

Usage:
  python manage.py create_invite <username> [email] [--workspace NAME]
                                           [--days 7] [--url https://…]

The link is printed; nothing is mailed (the app has no mail setup on
purpose — the operator can mail it themselves or copy it over).
"""
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.utils import timezone

from core.models import Invitation, hash_invite_token


class Command(BaseCommand):
    help = "Create an invitation link so a customer can set their own password."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("email", nargs="?", default="")
        parser.add_argument("--workspace", dest="workspace", default="Default",
                            help="name of the workspace for this account")
        parser.add_argument("--days", dest="days", type=int, default=7,
                            help="how many days the invitation is valid (default: 7)")
        parser.add_argument("--url", dest="url", default="",
                            help="public base URL of this instance "
                                 "(default: LEAFGURU_PUBLIC_URL)")

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model

        username = options["username"].strip()
        email = (options["email"] or "").strip()

        if not username:
            raise CommandError("a username is required")
        if get_user_model().objects.filter(username__iexact=username).exists():
            raise CommandError(
                f"a user named {username!r} already exists — "
                "they do not need an invitation"
            )
        if email:
            try:
                validate_email(email)
            except ValidationError:
                raise CommandError(f"{email!r} is not a valid email address")
        if options["days"] < 1:
            raise CommandError("--days must be at least 1")

        token = secrets.token_urlsafe(32)
        invite = Invitation.objects.create(
            username=username,
            email=email,
            token_hash=hash_invite_token(token),
            workspace_name=options["workspace"],
            expires_at=timezone.now() + timedelta(days=options["days"]),
        )

        base = (options["url"] or getattr(settings, "PUBLIC_URL", "") or "").rstrip("/")
        link = f"{base}/invite/{token}/"

        self.stdout.write(self.style.SUCCESS("invitation created"))
        self.stdout.write(f"  for      : {invite.username}"
                          + (f" <{invite.email}>" if invite.email else ""))
        self.stdout.write(f"  workspace: {invite.workspace_name}")
        self.stdout.write(f"  valid for: {options['days']} day(s)")
        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("  link:"))
        self.stdout.write(f"    {link}")
        self.stdout.write("")
        self.stdout.write("  Hand this link to the customer. It is single-use and "
                          "expires; issue a new one if it is lost.")
        self.stdout.write("  Only a hash of the token is stored, so the link "
                          "cannot be recovered from the database later.")

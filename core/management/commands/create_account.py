"""
Create an account + its workspace.

There is no public sign-up: the hosted service operator creates the
account for the customer. Self-hosters can use the same command to add
accounts to their own instance.

Usage:
  python manage.py create_account <username> [email] [--password PW]
                                    [--staff] [--workspace NAME]

The password is read from the --password option or prompted for (twice).
"""
import getpass

from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError

from core.auth import create_account
from core.models import Workspace


class Command(BaseCommand):
    help = "Create a LeafGuru account with its own workspace."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("email", nargs="?", default="")
        parser.add_argument("--password", dest="password", default=None)
        parser.add_argument("--staff", action="store_true",
                            help="also grant staff/admin rights")
        parser.add_argument("--workspace", dest="workspace", default="Default",
                            help="name of the workspace (default: Default)")

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model

        username = options["username"].strip()
        email = (options["email"] or "").strip()
        user_model = get_user_model()

        if user_model.objects.filter(username__iexact=username).exists():
            raise CommandError(f"a user named {username!r} already exists")
        if email:
            try:
                validate_email(email)
            except ValidationError:
                raise CommandError(f"{email!r} is not a valid email address")

        password = options["password"]
        if not password:
            password = getpass.getpass("Password: ")
            again = getpass.getpass("Repeat password: ")
            if password != again:
                raise CommandError("the passwords do not match")
        if len(password) < 8:
            raise CommandError("the password must be at least 8 characters")

        user, workspace = create_account(
            username=username,
            email=email,
            password=password,
            is_staff=options["staff"],
            workspace_name=options["workspace"],
        )
        self.stdout.write(self.style.SUCCESS(
            f"created account {user.get_username()!r} "
            f"(workspace {workspace.name!r}, id {workspace.id})"
        ))
        if options["staff"]:
            self.stdout.write("  staff rights granted")

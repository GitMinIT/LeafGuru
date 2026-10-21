"""
LeafGuru — invite-only account flow.

The operator issues an invitation; the customer sets their OWN password
via the link. The invitation is single-use and expires.
"""
from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from core.models import Invitation, Plant, Workspace


def make_invite(token="tok", username="alice", **kwargs):
    return Invitation.objects.create(
        username=username,
        email=kwargs.pop("email", "alice@example.com"),
        token=token,
        workspace_name=kwargs.pop("workspace_name", "Default"),
        expires_at=kwargs.pop("expires_at", timezone.now() + timedelta(days=7)),
        **kwargs,
    )


class InvitationModelTests(TestCase):
    def test_a_new_invitation_is_valid(self):
        invite = make_invite()
        self.assertTrue(invite.is_valid)
        self.assertFalse(invite.is_used)
        self.assertFalse(invite.is_expired)

    def test_a_used_invitation_is_not_valid(self):
        invite = make_invite(used_at=timezone.now())
        self.assertFalse(invite.is_valid)
        self.assertTrue(invite.is_used)

    def test_an_expired_invitation_is_not_valid(self):
        invite = make_invite(expires_at=timezone.now() - timedelta(days=1))
        self.assertFalse(invite.is_valid)
        self.assertTrue(invite.is_expired)


class CreateInviteCommandTests(TestCase):
    def test_the_command_creates_an_invitation(self):
        out = StringIO()
        call_command("create_invite", "alice", "alice@example.com",
                     stdout=out, url="https://leaf.example.com")
        invite = Invitation.objects.get(username="alice")
        self.assertEqual(invite.email, "alice@example.com")
        self.assertIn(invite.token, out.getvalue())
        self.assertIn("https://leaf.example.com/invite/", out.getvalue())

    def test_the_command_refuses_an_existing_user(self):
        get_user_model().objects.create_user(
            username="bob", email="", password="bob-password-123")
        with self.assertRaises(CommandError):
            call_command("create_invite", "bob", stdout=StringIO())


@override_settings(AUTH_REQUIRED=True)
class AcceptInviteTests(TestCase):
    """The customer sets their own password."""

    def setUp(self):
        self.invite = make_invite()
        self.url = reverse("accept_invite", args=[self.invite.token])

    def test_the_form_renders(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "alice")
        self.assertContains(res, "password")

    def test_an_unknown_token_shows_the_expired_page(self):
        res = self.client.get(reverse("accept_invite", args=["nope"]))
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "expired")

    def test_setting_a_password_creates_the_account(self):
        res = self.client.post(self.url, {
            "password": "a-very-long-password",
            "password2": "a-very-long-password",
        })
        self.assertEqual(res.status_code, 302)

        user = get_user_model().objects.get(username="alice")
        self.assertTrue(user.check_password("a-very-long-password"))
        self.assertTrue(user.is_active)

        # the invitation is now used
        self.invite.refresh_from_db()
        self.assertTrue(self.invite.is_used)
        self.assertFalse(self.invite.is_valid)

        # the account owns a workspace
        self.assertTrue(Workspace.objects.filter(owner=user).exists())

        # and the user is signed in
        self.assertEqual(int(self.client.session["_auth_user_id"]), user.pk)

    def test_mismatched_passwords_are_refused(self):
        res = self.client.post(self.url, {
            "password": "a-very-long-password",
            "password2": "something-else",
        })
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "do not match")
        self.assertFalse(get_user_model().objects.filter(username="alice").exists())

    def test_a_short_password_is_refused(self):
        res = self.client.post(self.url, {"password": "short", "password2": "short"})
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "8 characters")
        self.assertFalse(get_user_model().objects.filter(username="alice").exists())

    def test_an_invitation_cannot_be_used_twice(self):
        self.client.post(self.url, {
            "password": "a-very-long-password",
            "password2": "a-very-long-password",
        })
        self.client.logout()
        res = self.client.post(self.url, {
            "password": "another-long-password",
            "password2": "another-long-password",
        })
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, "expired")

    def test_the_new_account_sees_only_its_own_data(self):
        res = self.client.post(self.url, {
            "password": "a-very-long-password",
            "password2": "a-very-long-password",
        })
        self.assertEqual(res.status_code, 302)

        user = get_user_model().objects.get(username="alice")
        workspace = Workspace.objects.get(owner=user)
        Plant.objects.create(
            id="44444444-4444-4444-8444-444444444444",
            workspace=workspace, name="Alice's Plant",
            stage="seedling", status="growing",
        )
        res = self.client.get("/api/v1/plants/")
        self.assertEqual(res.status_code, 200)
        names = [p["name"] for p in res.json()]
        self.assertEqual(names, ["Alice's Plant"])


@override_settings(AUTH_REQUIRED=True)
class PageGuardTests(TestCase):
    """The app shell follows the API: no account, no pages."""

    PAGE_URLS = ["/", "/grows/", "/plants/", "/locations/", "/equipment/",
                 "/strains/", "/tasks/", "/timeline/", "/history/",
                 "/settings/", "/data/"]

    def test_anonymous_visitors_are_sent_to_the_login_form(self):
        for url in self.PAGE_URLS:
            res = self.client.get(url)
            self.assertEqual(res.status_code, 302, f"{url} should redirect")
            self.assertIn("/login/", res["Location"], f"{url} should redirect to login")

    def test_a_signed_in_user_gets_the_pages(self):
        from django.contrib.auth import get_user_model

        user = get_user_model().objects.create_user(
            username="carol", email="", password="a-very-long-password")
        self.client.force_login(user)
        for url in self.PAGE_URLS:
            res = self.client.get(url)
            self.assertEqual(res.status_code, 200, f"{url} should render")

    def test_the_login_page_is_always_reachable(self):
        res = self.client.get("/login/")
        self.assertEqual(res.status_code, 200)


class NoAuthPageTests(TestCase):
    """In self-hosted mode (no accounts) the pages stay open."""

    def test_the_pages_render_without_an_account(self):
        for url in ["/", "/plants/", "/data/"]:
            res = self.client.get(url)
            self.assertEqual(res.status_code, 200, f"{url} should render")

"""
LeafGuru — security regression tests.

These lock in the two findings from the 2026-10-21 audit:
  - the login page must not redirect to another host (open redirect)
  - the photo upload must enforce the size limit server-side
"""
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse

from core.models import Photo, Plant, Workspace


@override_settings(AUTH_REQUIRED=True)
class LoginRedirectTests(TestCase):
    """The `next` parameter must stay on this host."""

    def setUp(self):
        self.url = reverse("login")
        get_user_model().objects.create_user(
            username="alice", email="", password="correct horse battery"
        )

    def _login(self, next_value):
        return self.client.post(
            self.url + f"?next={next_value}",
            {"username": "alice", "password": "correct horse battery"},
        )

    def test_an_offsite_next_is_not_followed(self):
        """A link to /login/?next=https://evil.example must not redirect there."""
        response = self._login("https://evil.example/steal")
        self.assertEqual(response.status_code, 302)
        location = response["Location"]
        self.assertNotIn("evil.example", location)
        # the dashboard is mounted at the root, so that is where we land
        self.assertEqual(location, reverse("dashboard"))

    def test_a_protocol_relative_next_is_not_followed(self):
        """//evil.example is a protocol-relative URL - it must not be followed."""
        response = self._login("//evil.example/steal")
        self.assertEqual(response.status_code, 302)
        self.assertNotIn("evil.example", response["Location"])

    def test_a_local_path_is_followed(self):
        """A normal in-app path must still work."""
        response = self._login("/plants/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/plants/", response["Location"])

    def test_the_form_never_echoes_an_offsite_next(self):
        """The hidden field must not carry an offsite value either."""
        response = self.client.get(self.url + "?next=https://evil.example/steal")
        body = response.content.decode("utf-8", "replace")
        self.assertNotIn("evil.example", body)

    def test_no_next_at_all_lands_on_the_dashboard(self):
        response = self._login("")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], reverse("dashboard"))


@override_settings(AUTH_REQUIRED=True)
class PhotoUploadLimitTests(TestCase):
    """The server enforces the limit, not just the browser."""

    def setUp(self):
        self.workspace = Workspace.objects.create(name="Default")
        get_user_model().objects.create_user(
            username="alice", email="", password="correct horse battery"
        )
        self.client.login(username="alice", password="correct horse battery")

    def _png_bytes(self, size):
        # a PNG header is enough: the endpoint checks type and size,
        # not the actual image content
        return b"\x89PNG\r\n\x1a\n" + b"0" * size

    def test_a_photo_within_the_limit_is_accepted(self):
        with override_settings(MAX_PHOTO_BYTES=1024 * 1024):
            response = self.client.post(
                "/api/v1/photos/",
                {
                    "file": SimpleUploadedFile(
                        "a.png", self._png_bytes(100), content_type="image/png"
                    )
                },
            )
        self.assertEqual(response.status_code, 200, response.content[:300])

    def test_an_oversized_photo_is_refused(self):
        with override_settings(MAX_PHOTO_BYTES=1024):
            response = self.client.post(
                "/api/v1/photos/",
                {
                    "file": SimpleUploadedFile(
                        "big.png", self._png_bytes(4096), content_type="image/png"
                    )
                },
            )
        self.assertEqual(response.status_code, 413, response.content[:300])
        # nothing was written
        self.assertEqual(Plant.objects.count(), 0)
        self.assertEqual(Photo.objects.count(), 0)

    def test_a_wrong_content_type_is_refused(self):
        with override_settings(MAX_PHOTO_BYTES=1024 * 1024):
            response = self.client.post(
                "/api/v1/photos/",
                {
                    "file": SimpleUploadedFile(
                        "a.html", b"<script>alert(1)</script>",
                        content_type="text/html"
                    )
                },
            )
        self.assertEqual(response.status_code, 422, response.content[:300])


@override_settings(AUTH_REQUIRED=True)
class LoginLockoutTests(TestCase):
    """A script must not be able to guess passwords forever."""

    def setUp(self):
        self.url = reverse("login")
        get_user_model().objects.create_user(
            username="alice", email="", password="correct horse battery"
        )

    def _try(self, password):
        return self.client.post(
            self.url, {"username": "alice", "password": password}
        )

    def test_a_correct_password_still_works(self):
        response = self._try("correct horse battery")
        self.assertEqual(response.status_code, 302)

    def test_repeated_failures_lock_the_account_out(self):
        from core.auth import LOGIN_MAX_FAILURES

        for _ in range(LOGIN_MAX_FAILURES):
            response = self._try("wrong")
            self.assertNotIn("Too many", response.content.decode("utf-8", "replace"))

        # the next attempt is refused, even with the RIGHT password
        response = self._try("correct horse battery")
        body = response.content.decode("utf-8", "replace")
        self.assertIn("Too many", body)
        self.assertEqual(response.status_code, 200)   # the form, not a redirect

    def test_a_successful_login_clears_the_counter(self):
        from core.auth import LOGIN_MAX_FAILURES
        from core.models import LoginAttempt

        for _ in range(LOGIN_MAX_FAILURES - 1):
            self._try("wrong")
        self.assertEqual(self._try("correct horse battery").status_code, 302)

        # the counter was wiped by the successful sign-in
        self.assertEqual(LoginAttempt.objects.count(), 0)

        # so the budget starts over: one more failure below the limit
        # still leaves the correct password working
        self._try("wrong")
        self.assertEqual(self._try("correct horse battery").status_code, 302)
        self.assertEqual(LoginAttempt.objects.count(), 0)

    def test_a_different_username_is_not_locked_out(self):
        from core.auth import LOGIN_MAX_FAILURES

        for _ in range(LOGIN_MAX_FAILURES + 5):
            self._try("wrong")
        # bob's account is untouched
        response = self.client.post(
            self.url, {"username": "bob", "password": "whatever"}
        )
        body = response.content.decode("utf-8", "replace")
        self.assertNotIn("Too many", body)

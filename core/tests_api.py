"""
LeafGuru — server API tests.

These run against the real database (a temporary SQLite file) and the
real schema validation, so they cover the whole server path: JSON in ->
schema check -> Django model -> JSON out.
"""
import json

from django.test import Client, TestCase
from django.urls import reverse

from core.models import ENTITIES, Plant, Workspace


class WorkspaceMixin:
    """Give every test a client and a known workspace."""

    def setUp(self):
        super().setUp()
        self.client = Client()
        self.workspace = Workspace.objects.create(name="Test")

    def api(self, path):
        return self.client.get(f"/api/v1{path}")


class AuthStatusTests(WorkspaceMixin, TestCase):
    def test_status_reports_no_auth_by_default(self):
        res = self.api("/auth/status/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data["authRequired"])
        self.assertTrue(data["server"])
        self.assertEqual(data["workspace"], "Default")
        self.assertIsNone(data["user"])

    def test_status_works_without_a_session(self):
        # the storage factory probes this before anything else
        res = self.api("/auth/status/")
        self.assertEqual(res.status_code, 200)


class EntityCrudTests(WorkspaceMixin, TestCase):
    def make_plant(self, **overrides):
        plant = {
            "id": "11111111-1111-4111-8111-111111111111",
            "name": "Test Plant",
            "strainTemplateId": None,
            "customStrain": None,
            "sex": "unknown",
            "germinationDate": "2026-10-01",
            "stage": "seedling",
            "locationId": None,
            "growId": None,
            "status": "growing",
            "harvestYieldG": None,
            "budG": None,
            "leafG": None,
            "sugarLeafG": None,
            "stemG": None,
            "smellTerpenes": None,
            "harvestedAt": None,
            "notes": None,
            "createdAt": "2026-10-01T08:00:00.000Z",
            "updatedAt": "2026-10-01T08:00:00.000Z",
        }
        plant.update(overrides)
        return plant

    def test_list_is_empty_at_first(self):
        res = self.api("/plants/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), [])

    def test_create_read_update_delete(self):
        plant = self.make_plant()

        res = self.client.post(
            "/api/v1/plants/",
            data=json.dumps(plant),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        created = res.json()
        self.assertEqual(created["name"], "Test Plant")
        self.assertEqual(created["id"], plant["id"])
        self.assertEqual(created["germinationDate"], "2026-10-01")
        # the record really is in the database
        self.assertTrue(Plant.objects.filter(pk=plant["id"]).exists())

        res = self.api(f"/plants/{plant['id']}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["name"], "Test Plant")

        res = self.client.put(
            f"/api/v1/plants/{plant['id']}/",
            data=json.dumps(self.make_plant(name="Renamed")),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertEqual(res.json()["name"], "Renamed")
        self.assertEqual(Plant.objects.get(pk=plant["id"]).name, "Renamed")

        res = self.client.delete(f"/api/v1/plants/{plant['id']}/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Plant.objects.filter(pk=plant["id"]).exists())

    def test_invalid_payload_is_rejected(self):
        # a plant without a name violates the JSON schema
        bad = self.make_plant()
        del bad["name"]
        res = self.client.post(
            "/api/v1/plants/",
            data=json.dumps(bad),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 422, res.content[:300])
        self.assertEqual(Plant.objects.count(), 0)

    def test_unknown_id_is_404(self):
        res = self.api("/plants/99999999-9999-4999-8999-999999999999/")
        self.assertEqual(res.status_code, 404)

    def test_edits_are_logged(self):
        plant = self.make_plant()
        self.client.post(
            "/api/v1/plants/",
            data=json.dumps(plant),
            content_type="application/json",
        )
        self.client.put(
            f"/api/v1/plants/{plant['id']}/",
            data=json.dumps(self.make_plant(name="Renamed")),
            content_type="application/json",
        )
        edits = list(Plant.objects.get(pk=plant["id"]).workspace.entityedit_records.all())
        self.assertTrue(edits, "the change log recorded the edit")
        keys = {c["key"] for c in edits[0].changes}
        self.assertIn("name", keys)


class BundleTests(WorkspaceMixin, TestCase):
    def test_export_has_the_bundle_shape(self):
        res = self.api("/bundle/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["meta"]["app"], "LeafGuru")
        self.assertEqual(data["meta"]["schemaVersion"], 1)
        for entity in ENTITIES:
            self.assertIn(entity, data, f"bundle contains {entity}")
            self.assertIsInstance(data[entity], list)

    def test_import_round_trip(self):
        plant = {
            "id": "22222222-2222-4222-8222-222222222222",
            "name": "Imported Plant",
            "strainTemplateId": None, "customStrain": None, "sex": "unknown",
            "germinationDate": "2026-10-01", "stage": "seedling",
            "locationId": None, "growId": None, "status": "growing",
            "harvestYieldG": None, "budG": None, "leafG": None,
            "sugarLeafG": None, "stemG": None, "smellTerpenes": None,
            "harvestedAt": None, "notes": None,
            "createdAt": "2026-10-01T08:00:00.000Z",
            "updatedAt": "2026-10-01T08:00:00.000Z",
        }
        bundle = {
            "meta": {"app": "LeafGuru", "schemaVersion": 1,
                     "exportedAt": "2026-10-01T08:00:00.000Z", "appVersion": "0.1.0"},
            "grows": [], "locations": [], "equipment": [],
            "strainTemplates": [], "plants": [plant],
            "stageLogs": [], "measurements": [], "locationChanges": [],
            "tasks": [], "logEntries": [], "photos": [],
        }
        res = self.client.post(
            "/api/v1/bundle/",
            data=json.dumps(bundle),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertTrue(Plant.objects.filter(pk=plant["id"]).exists())

        # export again -> the plant is in there, with the same id
        data = self.api("/bundle/").json()
        self.assertEqual(len(data["plants"]), 1)
        self.assertEqual(data["plants"][0]["id"], plant["id"])
        self.assertEqual(data["plants"][0]["name"], "Imported Plant")

    def test_import_rejects_a_corrupt_bundle(self):
        res = self.client.post(
            "/api/v1/bundle/",
            data=json.dumps({"meta": {"app": "NotLeafGuru"}}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 422)


class AuthModeTests(TestCase):
    """The auth mode decides whether accounts exist."""

    def test_shared_workspace_exists_in_no_auth_mode(self):
        from django.conf import settings

        self.assertFalse(settings.AUTH_REQUIRED)
        res = Client().get("/api/v1/auth/status/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()["authRequired"])

    def test_login_page_redirects_when_auth_is_disabled(self):
        res = Client().get("/login/")
        self.assertEqual(res.status_code, 302)
        self.assertIn("/", res["Location"])

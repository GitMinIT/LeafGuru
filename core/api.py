"""
LeafGuru — REST API (django-ninja).

The API is schema-driven: every payload is validated against the very
same schemas/*.schema.json files the browser uses, so the server and the
client can never disagree about the data model.

Endpoints (all under /api/v1/):

  GET    /api/v1/auth/status/      -> { authRequired, user, workspace }
  GET    /api/v1/<entity>/         -> list
  POST   /api/v1/<entity>/         -> create
  GET    /api/v1/<entity>/<id>/    -> read
  PUT    /api/v1/<entity>/<id>/    -> update
  DELETE /api/v1/<entity>/<id>/    -> delete
  GET    /api/v1/bundle/           -> full export (bundle shape)
  POST   /api/v1/bundle/           -> import (replaces the workspace)
  POST   /api/v1/photos/           -> upload a photo

Authentication follows the deployment mode:
  * LEAFGURU_AUTH=none     -> no auth; everything lands in the shared
                              workspace (self-hosted on a LAN)
  * LEAFGURU_AUTH=required -> a session is required; the user's own
                              workspace is used (hosted service)
"""
import datetime as dt
import logging
import uuid
from typing import Optional

import jsonschema
from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.http import Http404
from ninja import Body, File, NinjaAPI, Schema
from ninja.errors import HttpError
from ninja.files import UploadedFile
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT7

from .auth import (
    auth_required,
    create_workspace,
    current_workspace,
    list_workspaces,
)
from .models import ENTITIES, EntityEdit, Photo
from .serializers import from_json, load_schema, to_json

# CSRF protection is on by default in django-ninja 1.x (per-view
# opt-out via csrf=False). The browser client sends the CSRF token with
# its fetch calls (see the server adapter).
logger = logging.getLogger("leafguru.api")

api = NinjaAPI(urls_namespace="leafguru-api")


# --- helpers ---------------------------------------------------------------

def _now():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_dt(text):
    """
    Parse an ISO timestamp into an aware UTC datetime.

    Accepts "....Z", "....+00:00", "....+02:00" and a naive "...."
    (treated as UTC). Never appends an offset to a value that already
    has one.
    """
    if not text:
        return None
    if isinstance(text, dt.datetime):
        parsed = text
    else:
        value = str(text).strip()
        if value.endswith(("Z", "z")):
            value = value[:-1] + "+00:00"
        try:
            parsed = dt.datetime.fromisoformat(value)
        except ValueError:
            # tolerate e.g. more than 6 fractional digits
            parsed = dt.datetime.fromisoformat(value[:26])
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def _workspace(request):
    try:
        return current_workspace(request)
    except PermissionDenied:
        raise


#: all schema files, so that "$ref": "plant.schema.json" resolves
_SCHEMA_FILES = [file for _model, file in ENTITIES.values()] + ["bundle.schema.json"]

_REGISTRY = None


def _registry():
    """
    A jsonschema registry that resolves the schema files from disk.

    The bundle schema references the entity schemas by relative filename
    ("$ref": "plant.schema.json"). Without a registry those references
    cannot be resolved and validating a bundle raises.
    """
    global _REGISTRY
    if _REGISTRY is None:
        registry = Registry()
        for file in _SCHEMA_FILES:
            schema = load_schema(file)
            uri = schema.get("$id") or file
            resource = Resource.from_contents(schema, default_specification=DRAFT7)
            registry = registry.with_resource(uri, resource)
        _REGISTRY = registry
    return _REGISTRY


def _model_for(entity):
    if entity not in ENTITIES:
        raise KeyError(entity)
    return ENTITIES[entity][0]


def _schema_for(entity):
    return load_schema(ENTITIES[entity][1])


def _validate(entity, payload):
    """Validate a payload against the entity's JSON schema."""
    schema = _schema_for(entity)
    validator = jsonschema.Draft7Validator(schema, registry=_registry())
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.absolute_path))
    if errors:
        first = errors[0]
        path = ".".join(str(p) for p in first.absolute_path) or "record"
        detail = f"{path}: {first.message}"
        if len(errors) > 1:
            detail += f" (+{len(errors) - 1} more)"
        raise HttpError(422, detail)
    return payload


def _resolve_fks(model_class, values, workspace):
    """
    Turn the JSON id strings into model instances.

    A foreign key may reference a record that does not exist yet (the
    client generates ids), so an unknown id becomes a new unsaved
    object with that id — it is created when it is saved.
    """
    resolved = {}
    for name, value in values.items():
        try:
            field = model_class._meta.get_field(name)
        except Exception:
            resolved[name] = value
            continue
        if not (field.many_to_one or field.one_to_one):
            resolved[name] = value
            continue
        if value in (None, ""):
            resolved[name] = None
            continue
        related_model = field.related_model
        if isinstance(value, related_model):
            resolved[name] = value
            continue
        try:
            pk = uuid.UUID(str(value))
        except (ValueError, AttributeError):
            resolved[name] = value
            continue
        obj = related_model.objects.filter(pk=pk).first()
        if obj is None:
            obj = related_model(id=pk, workspace=workspace)
        resolved[name] = obj
    return resolved


def _diff(before, after):
    """Field-level diff between two records (mirrors the browser logic)."""
    volatile = {"id", "createdAt", "created_at", "updatedAt", "updated_at"}
    changes = []
    for key in set(before or {}) | set(after or {}):
        if key in volatile:
            continue
        old = (before or {}).get(key)
        new = (after or {}).get(key)
        if old != new:
            changes.append({"key": key, "from": old, "to": new})
    return changes


def _record_changes(workspace, entity, entity_id, before, after):
    """Write the change-log entry (never blocks the actual write)."""
    changes = _diff(before, after)
    if not changes:
        return
    try:
        EntityEdit.objects.create(
            id=uuid.uuid4(),
            workspace=workspace,
            entity=entity,
            entity_id=entity_id,
            at=_parse_dt(after.get("updatedAt")),
            changes=changes,
            created_at=_parse_dt(after.get("createdAt")),
            updated_at=_parse_dt(after.get("updatedAt")),
        )
    except Exception:
        # the audit trail must never break the actual write — but a silent
        # swallow hid a real bug for a while, so log it
        logger.exception("could not record the change log for %s %s", entity, entity_id)


# --- generic entity operations --------------------------------------------

def _list_records(request, entity):
    workspace = _workspace(request)
    model_class = _model_for(entity)
    schema = _schema_for(entity)
    return [
        to_json(model_class, r, schema)
        for r in model_class.objects.filter(workspace=workspace)
    ]


def _get_record(request, entity, record_id):
    workspace = _workspace(request)
    model_class = _model_for(entity)
    schema = _schema_for(entity)
    record = model_class.objects.filter(workspace=workspace, pk=record_id).first()
    if record is None:
        raise Http404(f"{entity} {record_id} not found")
    return to_json(model_class, record, schema)


def _create_record(request, entity, payload):
    workspace = _workspace(request)
    model_class = _model_for(entity)
    schema = _schema_for(entity)
    _validate(entity, payload)

    values = from_json(model_class, payload, schema)
    values = _resolve_fks(model_class, values, workspace)
    record_id = values.pop("id", None)
    record = model_class(workspace=workspace, **values)
    if record_id:
        try:
            record.id = uuid.UUID(str(record_id))
        except (ValueError, AttributeError):
            record.id = uuid.uuid4()
    now = _parse_dt(_now())
    if hasattr(record, "created_at") and not record.created_at:
        record.created_at = now
    if hasattr(record, "updated_at"):
        record.updated_at = now
    record.save()
    return to_json(model_class, record, schema)


def _update_record(request, entity, record_id, payload):
    """
    Update a record — or create it when it does not exist yet.

    This is an UPSERT on purpose: the local adapter's put() writes the
    record under its id (create when new, update when known), and the
    client sends PUT for records it generated an id for. Creating here
    keeps both adapters behaving the same.
    """
    workspace = _workspace(request)
    model_class = _model_for(entity)
    schema = _schema_for(entity)
    _validate(entity, payload)

    record = model_class.objects.filter(workspace=workspace, pk=record_id).first()
    if record is None:
        # create it (same semantics as the local adapter)
        payload = {**payload, "id": record_id}
        return _create_record(request, entity, payload)

    before = to_json(model_class, record, schema)
    values = from_json(model_class, payload, schema)
    values = _resolve_fks(model_class, values, workspace)
    for name, value in values.items():
        if name == "id":
            continue
        setattr(record, name, value)
    if hasattr(record, "updated_at"):
        record.updated_at = _parse_dt(_now())
    record.save()
    after = to_json(model_class, record, schema)
    _record_changes(workspace, entity, record_id, before, after)
    return after


def _delete_record(request, entity, record_id):
    workspace = _workspace(request)
    model_class = _model_for(entity)
    deleted = model_class.objects.filter(workspace=workspace, pk=record_id).delete()
    if not deleted[0]:
        raise Http404(f"{entity} {record_id} not found")
    return {"deleted": True, "id": record_id}


# --- auth status -----------------------------------------------------------

class AuthStatus(Schema):
    authRequired: bool
    user: Optional[str] = None
    userEmail: Optional[str] = None
    workspace: Optional[str] = None
    workspaceId: Optional[str] = None
    server: bool = True


@api.get("/auth/status/", response=AuthStatus, tags=["auth"], url_name="auth_status")
def auth_status(request):
    """Tells the client which mode the server runs in."""
    user = getattr(request, "user", None)
    authenticated = bool(user and user.is_authenticated)
    workspace = None
    if authenticated or not auth_required():
        workspace = current_workspace(request)
    return {
        "authRequired": auth_required(),
        "user": user.get_username() if authenticated else None,
        "userEmail": getattr(user, "email", None) if authenticated else None,
        "workspace": workspace.name if workspace else None,
        "workspaceId": str(workspace.id) if workspace else None,
        "server": True,
    }


# --- workspaces -----------------------------------------------------------

class WorkspaceOut(Schema):
    id: str
    name: str
    owner: Optional[str] = None
    recordCount: int = 0


@api.get("/workspaces/", response=list, tags=["auth"], url_name="workspace_list")
def workspace_list(request):
    """The workspaces the caller may use (the server-side profiles)."""
    out = []
    for workspace in list_workspaces(request):
        out.append({
            "id": str(workspace.id),
            "name": workspace.name,
            "owner": workspace.owner.get_username() if workspace.owner else None,
        })
    return out


@api.post("/workspaces/", response=dict, tags=["auth"], url_name="workspace_create")
def workspace_create(request, payload: dict = Body(...)):
    """Create a workspace (a new, independent set of grow data)."""
    try:
        workspace = create_workspace(request, payload.get("name", ""))
    except ValueError as exc:
        raise HttpError(422, str(exc))
    return {
        "id": str(workspace.id),
        "name": workspace.name,
        "owner": workspace.owner.get_username() if workspace.owner else None,
    }


@api.delete("/workspaces/{workspace_id}/", tags=["auth"], url_name="workspace_delete")
def workspace_delete(request, workspace_id: str):
    """Delete a workspace and all of its data."""
    from .models import Workspace

    workspace = Workspace.objects.filter(pk=workspace_id).first()
    if workspace is None:
        raise HttpError(404, "workspace not found")
    if auth_required():
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated or workspace.owner_id != user.id:
            raise HttpError(403, "not your workspace")
    workspace.delete()
    return {"deleted": True, "id": workspace_id}


# --- bundle (export / import) ---------------------------------------------

@api.get("/bundle/", tags=["data"], url_name="bundle_export")
def bundle_export(request):
    """The full state of the workspace, in the browser bundle format."""
    workspace = _workspace(request)
    out = {
        "meta": {
            "app": "LeafGuru",
            "schemaVersion": 1,
            "exportedAt": _now(),
            "appVersion": "1.0.0",
        }
    }
    for entity, (model_class, schema_file) in ENTITIES.items():
        schema = load_schema(schema_file)
        records = []
        for record in model_class.objects.filter(workspace=workspace):
            data = to_json(model_class, record, schema)
            if entity == "photos":
                # the bytes are fetched separately; keep the reference
                data["blob"] = None
            records.append(data)
        out[entity] = records
    return out


@api.post("/bundle/", tags=["data"], url_name="bundle_import")
def bundle_import(request, payload: dict = Body(...)):
    """
    Import a bundle, replacing the workspace's data.

    The payload is validated against schemas/bundle.schema.json first, so
    a corrupt file never lands in the database.
    """
    workspace = _workspace(request)
    bundle_schema = load_schema("bundle.schema.json")
    validator = jsonschema.Draft7Validator(bundle_schema, registry=_registry())
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.absolute_path))
    if errors:
        first = errors[0]
        path = ".".join(str(p) for p in first.absolute_path) or "bundle"
        detail = f"{path}: {first.message}"
        if len(errors) > 1:
            detail += f" (+{len(errors) - 1} more)"
        raise HttpError(422, detail)

    for entity, (model_class, schema_file) in ENTITIES.items():
        model_class.objects.filter(workspace=workspace).delete()
    for entity, (model_class, schema_file) in ENTITIES.items():
        schema = load_schema(schema_file)
        for record in payload.get(entity, []):
            values = from_json(model_class, record, schema)
            values = _resolve_fks(model_class, values, workspace)
            record_id = values.pop("id", None)
            instance = model_class(workspace=workspace, **values)
            if record_id:
                try:
                    instance.id = uuid.UUID(str(record_id))
                except (ValueError, AttributeError):
                    instance.id = uuid.uuid4()
            instance.save()
    return {"imported": True}


# --- photos ----------------------------------------------------------------

@api.post("/photos/", tags=["photos"], url_name="photo_upload")
def photo_upload(request, file: UploadedFile = File(...),
                 payload: dict = Body(default={})):
    """Upload a photo. The bytes go to MEDIA_ROOT, the metadata to the DB."""
    workspace = _workspace(request)
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HttpError(422, "unsupported image type")
    # the size limit is enforced here, not only in the browser
    max_bytes = getattr(settings, "MAX_PHOTO_BYTES", 10 * 1024 * 1024)
    if file.size > max_bytes:
        raise HttpError(
            413, f"the photo is larger than {max_bytes // (1024 * 1024)} MB"
        )
    photo = Photo(
        id=uuid.uuid4(),
        workspace=workspace,
        image=file,
        mime_type=file.content_type,
        taken_at=_parse_dt(payload.get("takenAt") or _now()),
        note=payload.get("note") or None,
        phase_tag=payload.get("phaseTag") or None,
    )
    if payload.get("plantId"):
        photo.plant_id = payload["plantId"]
    if payload.get("logEntryId"):
        photo.log_entry_id = payload["logEntryId"]
    photo.save()
    return {"id": str(photo.id), "url": photo.image.url if photo.image else None}


# --- generic entity routes -------------------------------------------------

def _register_entity_routes(entity):
    """Register the five CRUD endpoints for one entity."""
    @api.get(f"/{entity}/", response=list, tags=["data"],
             url_name=f"{entity}_list", operation_id=f"{entity}_list")
    def list_entity(request):
        return _list_records(request, entity)

    @api.post(f"/{entity}/", response=dict, tags=["data"],
              url_name=f"{entity}_create", operation_id=f"{entity}_create")
    def create_entity(request, payload: dict = Body(...)):
        return _create_record(request, entity, payload)

    @api.get(f"/{entity}/{{record_id}}/", response=dict, tags=["data"],
             url_name=f"{entity}_read", operation_id=f"{entity}_read")
    def read_entity(request, record_id: str):
        return _get_record(request, entity, record_id)

    @api.put(f"/{entity}/{{record_id}}/", response=dict, tags=["data"],
            url_name=f"{entity}_update", operation_id=f"{entity}_update")
    def update_entity(request, record_id: str, payload: dict = Body(...)):
        return _update_record(request, entity, record_id, payload)

    @api.delete(f"/{entity}/{{record_id}}/", tags=["data"],
                url_name=f"{entity}_delete", operation_id=f"{entity}_delete")
    def delete_entity(request, record_id: str):
        return _delete_record(request, entity, record_id)


for _entity in ENTITIES:
    _register_entity_routes(_entity)

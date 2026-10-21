"""
LeafGuru — JSON <-> Django conversion.

The JSON Schemas in schemas/ stay the single source of truth for the
data model (client-side validation, export/import, and the server API
all read the same files). This module converts between the JSON shapes
and the Django models:

  * field names: camelCase in JSON, snake_case in Django
    (`createdAt` <-> `created_at`)
  * foreign keys: `growId` in JSON, a real FK in Django
  * dates: "2026-09-14" (date) and "...T10:00:00.000Z" (date-time)
    strings in JSON, date/datetime objects in Django
  * nested objects (`size`, `stageDurations`, `locationAssignments`)
    keep their JSON key names, converted recursively

Nothing here duplicates the schema: the schema drives the conversion.
"""
import datetime as dt
import decimal
import json
import re
from pathlib import Path

from django.conf import settings

SCHEMA_DIR = Path(settings.BASE_DIR) / "schemas"

#: cache of parsed JSON schemas
_SCHEMA_CACHE = {}

_CAMEL_BOUNDARY = re.compile(r"(?<!^)(?=[A-Z])")


def snake(name: str) -> str:
    return _CAMEL_BOUNDARY.sub("_", name).lower()


def camel(name: str) -> str:
    return "".join(part.capitalize() for part in name.split("_"))


def load_schema(schema_file: str) -> dict:
    """Load a JSON schema (cached)."""
    if schema_file not in _SCHEMA_CACHE:
        path = SCHEMA_DIR / schema_file
        with open(path, "r", encoding="utf-8") as fh:
            _SCHEMA_CACHE[schema_file] = json.load(fh)
    return _SCHEMA_CACHE[schema_file]


def _is_fk(model, name: str) -> bool:
    try:
        field = model._meta.get_field(name)
    except Exception:
        return False
    return field.many_to_one or field.one_to_one


def _model_field_for(model, json_name: str):
    """
    Find the Django field for a JSON property name.

    FK fields are named after the target (e.g. `grow`), the JSON uses
    `growId`; everything else maps by camelCase <-> snake_case.
    """
    # a FK whose JSON name is <fk>Id
    for field in model._meta.get_fields():
        if not (field.many_to_one or field.one_to_one):
            continue
        if field.name == "workspace":
            continue
        if camel(field.name) + "Id" == json_name:
            return field
    candidate = snake(json_name)
    try:
        return model._meta.get_field(candidate)
    except Exception:
        return None


# --- value conversion ------------------------------------------------------

def _parse_date(value):
    if value in (None, ""):
        return None
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    return dt.date.fromisoformat(str(value)[:10])


def _parse_datetime(value):
    """
    Parse an ISO timestamp into an aware UTC datetime.

    Accepts "....Z", "....+00:00", "....+02:00" and a naive "...."
    (treated as UTC). Never appends an offset to a value that already
    has one.
    """
    if value in (None, ""):
        return None
    if isinstance(value, dt.datetime):
        parsed = value
    elif isinstance(value, dt.date):
        parsed = dt.datetime(value.year, value.month, value.day, tzinfo=dt.timezone.utc)
    else:
        text = str(value).strip()
        if text.endswith(("Z", "z")):
            text = text[:-1] + "+00:00"
        try:
            parsed = dt.datetime.fromisoformat(text)
        except ValueError:
            parsed = dt.datetime.fromisoformat(text[:26])
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def _iso(value):
    """
    Serialise a date/datetime to the canonical JSON form.

    Datetimes become UTC with a trailing "Z" — the same shape the
    browser writes, so the two sides round-trip exactly.
    """
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, dt.date):
        return value.isoformat()
    return value


def _convert_in(value, schema):
    """JSON value -> Python value, guided by the schema."""
    if value is None:
        return None
    types = schema.get("type")
    types = types if isinstance(types, list) else [types]
    fmt = schema.get("format")

    if "date" in types and fmt == "date":
        return _parse_date(value)
    if "date" in types and fmt == "date-time":
        return _parse_datetime(value)
    if "date" in types and "date-time" in types:
        # nullable date-time
        return _parse_datetime(value)
    if "array" in types:
        item_schema = schema.get("items", {})
        return [_convert_in(v, item_schema) for v in value]
    if "object" in types:
        if not isinstance(value, dict):
            return value
        out = {}
        for key, sub in (schema.get("properties") or {}).items():
            if key in value:
                out[key] = _convert_in(value[key], sub)
        # keep unknown keys as they are (additionalProperties is false in
        # the schemas, so this cannot normally happen)
        for key, v in value.items():
            out.setdefault(key, v)
        return out
    if "number" in types or "integer" in types:
        if isinstance(value, str) and value.strip() not in ("", "null"):
            try:
                number = float(value)
            except ValueError:
                return value
            # keep ints as ints (the schema distinguishes them)
            return int(number) if "integer" in types and number.is_integer() else number
        return value
    return value


def _convert_out(value, schema):
    """Python value -> JSON value, guided by the schema."""
    if value is None:
        return None
    types = schema.get("type")
    types = types if isinstance(types, list) else [types]
    fmt = schema.get("format")

    if fmt == "date" or (fmt == "date-time"):
        return _iso(value)
    if "array" in types:
        item_schema = schema.get("items", {})
        return [_convert_out(v, item_schema) for v in (value or [])]
    if "object" in types:
        if not isinstance(value, dict):
            return value
        out = {}
        for key, sub in (schema.get("properties") or {}).items():
            if key in value:
                out[key] = _convert_out(value[key], sub)
        return out
    if isinstance(value, (dt.date, dt.datetime)):
        return _iso(value)
    if isinstance(value, decimal.Decimal):
        # the schema says "number"; Django would serialise a Decimal as a
        # string, which breaks the client (toFixed is not a function)
        return float(value)
    return value


# --- record <-> JSON ------------------------------------------------------

def to_json(model_class, record, schema, *, include_blob=False):
    """Django model instance -> JSON dict matching the schema."""
    out = {}
    for json_name, sub_schema in (schema.get("properties") or {}).items():
        field = _model_field_for(model_class, json_name)
        if field is None:
            continue
        if field.name == "workspace":
            continue
        if field.name == "image":
            # photos: the bytes are served separately
            if include_blob and record.image:
                out[json_name] = record.image.url
            continue
        if field.many_to_one or field.one_to_one:
            value = getattr(record, field.name, None)
            out[json_name] = str(value.id) if value is not None else None
            continue
        value = getattr(record, field.name, None)
        out[json_name] = _convert_out(value, sub_schema)
    return out


def from_json(model_class, data, schema, instance=None):
    """
    JSON dict -> field values for a Django model instance.

    Returns a dict of model field name -> value (not saved).
    """
    values = {}
    for json_name, sub_schema in (schema.get("properties") or {}).items():
        if json_name not in data:
            continue
        field = _model_field_for(model_class, json_name)
        if field is None:
            continue
        if field.name == "workspace":
            continue
        raw = data[json_name]
        if field.many_to_one or field.one_to_one:
            values[field.name] = raw
            continue
        values[field.name] = _convert_in(raw, sub_schema)
    return values


def apply_values(record, values):
    """Assign converted values onto a model instance."""
    for name, value in values.items():
        setattr(record, name, value)
    return record

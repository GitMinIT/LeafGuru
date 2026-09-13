# LeafGuru

Plan and track your grow: locations, equipment, strain templates, plants
with stage timelines, tasks, measurements and photos — local-first in your
browser, with JSON import/export and a path to a hosted multi-user version.

**Status:** phase-1 core complete — all entity CRUD, plant lifecycle
(stage timeline, location moves), measurements, photos, export/import.
See [ARCHITECTURE.md](ARCHITECTURE.md) and [ROADMAP.md](ROADMAP.md).

## Features (phase 1)

- Locations (indoor/outdoor, size) · Equipment (categories, assignment
  history) · Strain templates (expected durations/height)
- Plants: strain picker, stage timeline, location moves with history,
  measurements (height etc.), photo gallery (IndexedDB blobs)
- Task planning with due dates — dashboard shows due/overdue work
- Full JSON export/import (schema-validated, versioned; photos included)
- English UI, all strings externalized (`static/js/i18n/en.json`)

## Development

```bash
docker compose up -d --build
# → http://localhost:8090
```

Local (without Docker):
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate && python manage.py runserver
```

## Tests

```bash
docker run --rm -v "$PWD":/w -w /w node:22-alpine node --test tests/
```

46 tests: schema validator, LocalAdapter (incl. atomic failed import),
data IO, i18n, plant domain (stage/location transitions), photos
(serialize round-trip). The browser-environment stub
(`tests/helpers/browser-stub.js`) mirrors the IndexedDB contract the
adapter relies on.

## Repo layout

```
core/           Django app (shell, views, export/import stubs)
schemas/        JSON schemas — single source of truth for the data model
static/js/
  adapter/      StorageAdapter interface + LocalAdapter (IndexedDB)
  model/        validator (draft-07 subset, zero deps)
  i18n/         loader + en.json (all UI strings)
  schemas/      copies of schemas/*.schema.json (served to the browser)
templates/      Django templates
secrets/        git-ignored (github.token, later app secrets)
```

## Licence

[MIT](LICENSE)
# LeafGuru

Plan and track your grow: locations, equipment, strain templates, plants
with stage timelines, tasks, measurements and photos — local-first in your
browser, with JSON import/export and a path to a hosted multi-user version.

**Status:** phase-1.5 complete — all entity CRUD with cross-entity wiring
(grows, task links, equipment assignments, location back-references),
plant lifecycle (edit, cascade delete, stage timeline, location moves),
measurements with growth chart, photos, export/import.
See [ARCHITECTURE.md](ARCHITECTURE.md) and [ROADMAP.md](ROADMAP.md).

## Features

- Grows group locations (multi-select), plants, equipment and tasks
- Locations (indoor/outdoor, size) with detail: equipment here, plants
  here, grows using this location · Equipment (categories, assignment
  history, cost) · Strain templates (per-stage durations, genotype)
- Plants: strain picker, stage timeline, location moves with history,
  measurements (add/edit/remove + SVG growth chart), photo gallery
  (IndexedDB blobs), edit dialog, delete with cascade
- Task planning with due dates, plant/location/grow links, stage hints —
  dashboard shows due/overdue work and stats overview
- Search on all list pages; full JSON export/import (schema-validated,
  versioned; photos included)
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
docker run --rm -v "$PWD":/w -w /w node:22-alpine node --test tests/*.test.js
```

99 tests: schema validator, LocalAdapter (incl. atomic failed import),
data IO, i18n, plant domain (stage/location transitions, cascade, stage
progress), location domain (back-references), task domain, chart (SVG
builder), grow domain (costs), lifecycle smoke, page-level smoke tests
(DOM stub, incl. renderList recursion regression) and minimal-create
regression tests per entity (empty optional fields must be nullable).
The browser-environment stubs (`tests/helpers/browser-stub.js`,
`tests/helpers/dom-stub.js`) mirror the IndexedDB/DOM contracts the
adapter and pages rely on.

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
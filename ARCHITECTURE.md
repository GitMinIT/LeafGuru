# LeafGuru — Architecture

Plan-and-track companion for grow projects: locations, equipment, strain
templates, plants with stage timelines, task planning, measurements and
photos.

## Foundation decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Framework | **Django 5** (user's choice) | Batteries-included, mature ORM/admin for phase 2, templates |
| API layer | **django-ninja** | Pydantic-style schemas, matches the future REST endpoints; stubs in phase 1 |
| Frontend | Server-rendered templates + **Alpine.js** + vanilla JS storage layer | No SPA build chain; Django owns the shell |
| Phase-1 storage | **Browser**: IndexedDB (photos + main store) | Works offline, survives server downtime; photos decide this — too big for localStorage |
| Persistence escape hatch | **JSON import/export** (validated against schemas) | Works in both phases, forever; migration path browser→server |
| Phase-2 storage | Server DB (SQLite → Postgres), registration/auth | Same schema, adapter flip |
| Deployment | **Standalone** Docker (nginx + gunicorn), own compose | Not part of pompui.de stack |
| UI language | **English**, strings externalized in `i18n/en.json` | Other locales added later without code changes |
| Sensors | **Roadmap phase 3** | Data model prepared (reading entities), ingestion later |
| Legal | **Jurisdiction-neutral** | No built-in legal checks/limits |
| Licence | MIT (already in repo) | |

## Storage-adapter pattern (the core idea)

Both phases speak the **same JSON data model**:

```
Frontend
  StorageAdapter (interface)
    ├─ LocalAdapter   → IndexedDB (photos, blobs) + localStorage (small state)
    └─ ServerAdapter  → django-ninja REST API (phase 2)
```

- Phase 1: `LocalAdapter` is active. Django serves the app shell, static
  assets, schema docs and import/export endpoints. API endpoints exist but
  require phase-2 auth and are stubs.
- Phase 2: models land in Django (same field names), auth is added, the
  adapter flips to `ServerAdapter`. Import/export JSON shape is identical in
  both phases → users can move between local and hosted instances.
- The JSON schema files under `schemas/` are the single source of truth for
  validation (client-side via Ajv, server-side via ninja/pydantic in phase 2).

## Data model (v1)

Entities and their essential fields; IDs are UUIDs generated client-side
(so records are portable between adapters and import/export round-trips are
stable).

| Entity | Fields |
|---|---|
| Location | id, name, type (indoor/outdoor), size (w/d/h or area m²), notes, active |
| Equipment | id, name, category (light/pot/soil/fan/filter/nutrient/sensor/other), specs, purchase_date, cost, status, location_assignments[] (location_id, from, to) |
| StrainTemplate | id, name, breeder, genotype (indica/sativa/hybrid/unknown), stage_durations{} (expected days per stage), expected_height_cm, characteristics, notes |
| Plant | id, name, strain_template_id or custom_strain{}, sex (unknown/regular/female/male), germination_date, stage (current), location_id, status (growing/harvested/dried/cured/died), notes |
| StageLog | id, plant_id, stage (germinated/seedling/vegetative/flowering/harvest/drying/cured), entered_at, left_at |
| Measurement | id, plant_id, type (height/other), value, unit, measured_at, note |
| LocationChange | id, plant_id, from_location_id, to_location_id, changed_at, reason |
| Task | id, plant_id?, location_id?, title, description, due_date, stage_hint?, priority, status (open/done/skipped), completed_at |
| Photo | id, plant_id, blob (IndexedDB), taken_at, note, phase_tag |

Task planning is in MVP: tasks can hang off plants or locations, carry a
stage hint (e.g. "topping after 5 nodes → vegetative"), a due date and a
status. The dashboard shows due/overdue tasks.

## Directory layout (phase 1)

```
leafguru/            # Django project (config, settings, urls)
core/                # Django app: shell views, static serving, export/import stubs
schemas/             # JSON schemas — single source of truth for the data model
static/              # app JS (storage adapter, alpine components), CSS
  js/
    adapter/         # StorageAdapter interface, LocalAdapter, ServerAdapter stub
    model/           # entity helpers, validation, migration/versioning
    i18n/            # loader + en.json (all UI strings live here)
templates/           # Django templates (pages per entity + dashboard)
```

## Phase 2 notes (do not build yet)

- Django models mirror the JSON schemas 1:1 (field names identical)
- Auth: `django-allauth` or simple token; multi-user via FK on every entity
- Postgres via `DATABASE_URL`; media (photos) move from IndexedDB blobs to
  server storage; a one-time import migrates local JSON into the DB
- Backup story shifts from "user exports JSON" to server-side dumps
# LeafGuru

Plan and track your grow: locations, equipment, strain templates, plants
with stage timelines, tasks, measurements and photos — local-first in your
browser, with JSON import/export and a path to a hosted multi-user version.

**Status:** phase 2 (insights) and phase 2.5 (journal — the daily grow
log) complete. So far: all entity CRUD with
cross-entity wiring (grows, task links, equipment assignments, location
back-references), plant lifecycle (edit, cascade delete, stage timeline,
location moves), measurements with growth chart, photos, export/import,
stage countdowns, per-grow cost tracking, harvest statistics (yield +
cost per gram, actual stage durations), a timeline calendar and a
per-grow history with a verbose event popup.
See [ARCHITECTURE.md](ARCHITECTURE.md) and [ROADMAP.md](ROADMAP.md).

## Features

- Grows group locations (multi-select), plants, equipment and tasks
- Locations (indoor/outdoor, size) with detail: equipment here, plants
  here, grows using this location · Equipment as a tile grid (emoji or
  uploaded picture, category filter, hover-gear to edit, + tile to add;
  location assignment in the dialog) · Strain templates (per-stage
  durations, genotype)
- Plants: strain picker, stage timeline, location moves with history,
  measurements (add/edit/remove + SVG growth chart), photo gallery
  (IndexedDB blobs), edit dialog (incl. harvest yield + date), delete
  with cascade
- Grow insights: equipment costs per currency, harvest statistics
  (plants harvested, total/avg yield, cost per gram), actual stage
  durations (avg/min–max) from stage logs and a multi-series growth
  comparison chart with expected-height overlay
- Timeline calendar (/timeline/): month grid with per-day events —
  stage changes, harvests, grow start/end, open tasks — click an event
  for full details
- History (/history/): one grow's complete event log as a scrollable
  list (stages, harvests, measurements, moves, tasks, equipment) —
  click a row for a verbose popup with the raw record; shared popup
  with the timeline
- Journal: quick "+ Log" from every page (topbar) or the History page —
  watering/feeding/training/defoliation/treatment/fermentation entries
  with per-category fields (amount, pH, EC, temp, humidity, product/
  dose, technique, stress level, defoliation style/%), plants and
  photos; entries appear in History, Timeline and the
  popup (with thumbnails, deletable)
- Grow refinements: default grow (★) prefilled in all forms, harvest
  details on plants (buds/leaves/sugar leaves/stems in grams, smell/
  terpenes) summed per grow, "fermented" as stage/status, and
  multi-category journal entries with category-matched fields
- Settings (/settings/): language, date format, 12h/24h time and
  timezone — stored browser-local, applied instantly to all date
  displays and the +Log "When" input
- Tasks: Kanban board (open/done/skipped columns, click-to-move) or
  classic list — overdue highlighting, inline status changes, plant/
  location/grow links, stage hints, search; dashboard shows due/overdue
  work and stats overview
- Date fields everywhere get a calendar/clock picker honoring your
  format/timezone settings; dialog forms use a compact grid layout
- Search on all list pages; full JSON export/import (schema-validated,
  versioned; photos included)
- English UI, all strings externalized (`static/js/i18n/en.json`)
- Example dataset: `examples/leafguru-example.json` — import it on the
  Data page to explore the app with realistic data

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

153 tests: schema validator, LocalAdapter (incl. atomic failed import),
change tracking (per-entity edit trail),
data IO, i18n, plant domain (stage/location transitions, cascade, stage
progress), location domain (back-references), task domain, chart (SVG
builder), grow domain (costs, harvest statistics, stage durations),
timeline domain (month matrix, event collection), history domain
(per-grow event log) + event popup view, log domain (journal builder) +
quick-add flows, lifecycle smoke, page-level
smoke tests (DOM stub, incl. renderList recursion regression),
example-dataset checks (schema-valid, imports, round-trips) and
minimal-create regression tests per entity (empty optional fields must
be nullable), cancel-button wiring per dialog and strain day-duration
labels. The browser-environment stubs (`tests/helpers/browser-stub.js`,
`tests/helpers/dom-stub.js`) mirror the IndexedDB/DOM contracts the
adapter and pages rely on.

## Repo layout

```
core/           Django app (shell, views, export/import stubs)
schemas/        JSON schemas — single source of truth for the data model
examples/       leafguru-example.json — example dataset to import
static/js/
  adapter/      StorageAdapter interface + LocalAdapter (IndexedDB)
  model/        validator (draft-07 subset, zero deps), domain modules,
                settings store + date format (browser-local settings)
  i18n/         loader + en.json (all UI strings)
  schemas/      copies of schemas/*.schema.json (served to the browser)
templates/      Django templates
secrets/        git-ignored (github.token, later app secrets)
```

## Licence

[MIT](LICENSE)
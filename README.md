# LeafGuru

Plan and track your grow: locations, equipment, strain templates, plants
with stage timelines, tasks, measurements and photos — local-first in your
browser, with JSON import/export and a path to a hosted multi-user version.

**Status:** all entity CRUD with cross-entity wiring (grows, task
links, equipment assignments, location back-references), plant
lifecycle (edit, cascade delete, stage timeline, location moves),
measurements with growth chart, photos, export/import, stage countdowns,
per-grow cost tracking, harvest statistics (yield + cost per gram,
actual stage durations), a timeline calendar and a per-grow history
with a verbose event popup.

On top of that, the app now has a **front door**: a Today page that
greets you and says what your plants could use, one-tap journal
entries, a care-hints engine, a journal you read back, a sensors page
that the optional hardware will feed, and a welcome for the first run.
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
- **Profiles**: independent data sets in one browser (own plants, tasks,
  journal). Switch, duplicate or delete them from the topbar or the Data
  page. The default profile keeps the data that was already there
- **Demo grow**: one click on the Data page generates a complete example
  dataset (2 grows, 6 plants in every stage, equipment, tasks, journal
  entries) into its own `Demo` profile — your own data is never
  touched. All dates are relative to today, so it always looks like a
  grow in progress
- **Strain catalog**: 9,500+ well-known strains (breeder, genotype,
  potency, aroma) bundled with the app; pick one and the strain form is
  filled in with typical stage durations and height. Search by name or
  breeder; the popular subset is listed by default
- Example dataset: `examples/leafguru-example.json` — import it on the
  Data page to explore the app with realistic data

### The front door

- **Today** (`/`): the landing page. It greets you, shows what your
  plants could use right now, and offers one-tap journal entries. The
  old stats page is at `/dashboard/`
- **Care hints**: small, kind nudges from the app's own data — a grow
  that has not been watered in four days, a plant slower than its
  strain usually is, a reading outside the comfortable band. The rules
  are deliberate: silence is fine, we never invent a number you did
  not record, a hint is never a scolding, and every hint has a next
  step
- **Quick entries**: one tap logs the usual — watered, fed, trained,
  looked in, defoliated, treated. "Add details" then opens the full
  dialog, pre-filled
- **Journal** (`/journal/`): the daily story read back, grouped by
  day, filterable by grow and kind, searchable
- **Sensors** (`/sensors/`): readings from your environment, and the
  numbers you type in yourself. A card per metric, so a sensor that
  has not reported yet is a visible gap. The comfortable band is
  shown under every value, and it narrows with the grow's stage
- **The welcome**: on an empty app, four gentle steps (a place, a
  plant, a journal, the numbers), each one linking into the app. "Show
  me around first" loads the demo grow into its OWN profile, so it can
  never touch real data. A user who already has data is never greeted

### Sensor readings (the hardware's landing place)

- A reading belongs to a *place*, not to a plant: a temperature probe
  in a room can feed every plant in that room. So a reading may carry
  a grow, a location, a plant and a device id, and it says where it
  came from (typed in / a device / imported / calculated)
- A device posts to the same API the app uses, so the page works with
  no hardware at all — and starts making sense the moment some arrives
- The metrics: temperature, humidity, pH, EC, light, soil moisture,
  CO2, VPD, water level, nutrient level

## Deployment modes

Auth is a **deployment switch**, not a feature — the same image serves
every mode:

| `LEAFGURU_AUTH` | accounts | data lives in | for |
|---|---|---|---|
| `none` (default) | no | the server DB, one shared workspace | self-hosting on a LAN |
| `required` | yes, one workspace each | the server DB | the hosted service |

```bash
# self-hosted, no accounts (the default)
docker compose up -d --build
# → http://localhost:8090

# hosted service: accounts, per-user data
LEAFGURU_AUTH=required \
LEAFGURU_SECRET_KEY=... \
LEAFGURU_DATABASE_URL=postgres://... \
  docker compose up -d --build

# create an account for a customer (no public sign-up)
docker compose exec leafguru python manage.py create_account alice alice@example.com
```

The browser app also works with **no server at all** — the data then
lives in the browser (IndexedDB). The Data page shows where the data
lives and offers a one-time move to the server.

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

156 tests: schema validator, LocalAdapter (incl. atomic failed import),
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
adapter and pages rely on — including real `form.reset()` semantics
(it resets *every* descendant control, not just named ones) and DOM
re-parenting (`parentNode`), which is what the date-picker regression
depends on.

### Real-browser tests

Unit tests run against DOM stubs, which cannot see browser-level
behaviour (top-layer dialogs, `hidden` vs. `display`, native form
validation). A real Chromium run is therefore part of the workflow:

```bash
# 1. serve the app
docker compose -f /home/daniel/Projects/LeafGuru/docker-compose.yml up -d --build

# 2. drive it in a real browser (Playwright container, browsers preinstalled)
tests/browser/run.sh              # all checks
tests/browser/run.sh sweep        # one script
```

The scripts live in `tests/browser/`:

| script | covers |
|---|---|
| `sweep.js` | every page: create -> list -> edit -> delete, Kanban toggle, stage change, journal, timeline + history popups, settings, data page |
| `profiles.js` | profile switcher, create/duplicate/delete, and that the demo grow never touches the user data |
| `demo-catalog.js` | the demo grow and the strain catalog (search, prefill, save) |
| `screenshots.js` | captures every page (incl. mobile) for visual review |

They need `playwright-core` in `node_modules/` (git-ignored):
`npm install --no-save playwright-core`. The Playwright image ships
Chromium at `/ms-playwright/chromium-1140/chrome-linux/chrome`; the npm
package `playwright` is NOT needed (and installs time out).

The sweep exercises every page's primary flow (create → list → edit →
delete, Kanban toggle, stage change, journal entry, timeline popup,
history popup, settings round-trip, data export view) and asserts
*visible* state, not just the absence of console errors. Bugs it caught
that the unit tests could not: the date picker rendering behind modal
dialogs, the quick-log grow selection being wiped by `form.reset()`, the
`[hidden]` attribute being overridden by `display:` rules, and the
equipment category filter never being populated.

## Repo layout

```
core/           Django app (shell, views, export/import stubs)
schemas/        JSON schemas — single source of truth for the data model
examples/       leafguru-example.json — example dataset to import
tools/          build-strain-catalog.js — regenerate the bundled catalog
static/js/
  adapter/      StorageAdapter interface + LocalAdapter (IndexedDB)
  data/         strain-catalog.json — bundled catalogue (9.5k strains)
  model/        validator (draft-07 subset, zero deps), domain modules,
                settings store + date format (browser-local settings)
  i18n/         loader + en.json (all UI strings)
  schemas/      copies of schemas/*.schema.json (served to the browser)
templates/      Django templates
secrets/        git-ignored (github.token, later app secrets)
```

## Licence

[MIT](LICENSE)
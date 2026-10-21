# LeafGuru — Roadmap

## Phase 1 — MVP (local-first) ✅
- [x] Django shell project (standalone Docker: nginx + gunicorn)
- [x] Data model JSON schemas (`schemas/`), draft-07 subset validator client-side (zero deps)
- [x] StorageAdapter interface + LocalAdapter (IndexedDB + localStorage)
- [x] JSON import/export (full state, versioned, schema-validated)
- [x] Dashboard: plants by stage, due tasks (minimal)
- [x] Locations/Equipment/Strains/Tasks: basic schema-driven CRUD
- [x] Plants: CRUD, stage timeline (StageLog), location change log
- [x] Measurements (height etc.) — text list in plant detail
- [x] Photos per plant (IndexedDB blobs, gallery view)
- [x] i18n loader, `en.json` only

## Phase 1.5 — Entity pages: make them actually work ✅
- [x] **Tasks**: plant + location + grow selectors, stage hint, inline mark
      done/skipped/reopen, overdue highlighting, status filter, edit of
      open tasks
- [x] **Equipment**: location-assignment editor (assign/unassign with
      from–to history per schema `locationAssignments[]`), cost +
      currency fields
- [x] **Strains**: stageDurations as proper per-stage fields (seedling,
      vegetative, flowering — labeled correctly)
- [x] **Locations**: detail dialog with cross-entity back-references
      (equipment currently here incl. availableEverywhere, plants here,
      grows using this location)
- [x] **Data page**: per-entity record counts, export/import round-trip
      with all entities (photos incl.)
- [x] **Dashboard**: stats overview (active grows/locations, growing
      plants, open/overdue/due-today counts), grows overview,
      plants-by-stage fixed to growing plants only
- [x] **Plants**: edit dialog, delete with cascade (stage logs,
      measurements, location changes, photos — with confirm), search,
      measurement edit/remove, SVG growth chart (height history)
- [x] **Grows**: top-level entity grouping locations (locationIds[]),
      plants, equipment, tasks; detail dialog with linked entities
- [x] Lists: search box on plants/equipment/tasks/grows/locations,
      consistent action buttons
- [x] Measurements: add/edit/remove from plant detail + simple growth
      chart (SVG, no deps — `static/js/model/chart.js`)
- [x] Page-level smoke tests (DOM stub): renderList recursion
      regression, row/action rendering per page

## Phase 2 — Insights ✅
- [x] Stage countdowns vs. strain template durations — plant detail shows
      "day N of ~M" (+ days past schedule) from StageLog + stageDurations
- [x] Cost tracking per grow — equipment cost summary per currency in
      grow detail (shared availableEverywhere items excluded)
- [x] Harvest statistics — plant schema extended (harvestYieldG,
      harvestedAt, editable in plant dialog); grow detail shows plants
      harvested, total/avg yield and equipment cost per gram
- [x] Actual stage durations per grow — avg/min–max days per stage from
      closed StageLog entries (grow detail, next to template expectations)
- [x] Timeline/calendar visualization — month grid (Mon-first) with
      per-day events: stage changes, harvests, grow start/end, open tasks
      (`static/js/model/timeline-domain.js`, pure + tested; page /timeline/)
- [x] Example dataset for import testing — `examples/leafguru-example.json`
      (finished grow with harvest stats + active grow; covered by
      tests/example-data.test.js: schema-valid, imports, round-trips)
- [x] **History** (spontaneous addition, off the original plan): per-grow
      scrollable event log at /history/ — every dated record of one grow
      (grow start/end, germinations, stage changes, harvests,
      measurements, location moves, photos, tasks planned/done/skipped,
      equipment purchases/assignments incl. availableEverywhere) in one
      chronological list with sticky date headers. Clicking a row — or an
      event in the Timeline — opens a shared verbose popup: formatted
      detail fields + the raw record JSON. Pure collection logic in
      `static/js/model/history-domain.js`, popup view in
      `static/js/model/history-view.js` (shared with the timeline).
- [x] Growth charts: multi-series — all height histories of a grow's
      plants in one chart (distinct colors, legend, per-point tooltips),
      plus dashed expected-height overlay(s) from the strain templates.
      `chart.multiLineChart()` in `static/js/model/chart.js`; rendered in
      the grow detail dialog.

## Phase 2.5 — Journal (daily-driver feature) ✅

The app can configure a grow but cannot journal it day-to-day. This phase
closes that gap: the user opens the app, picks the grow, and notes what
just happened — watering, feeding, training, treatment, observations —
with optional numbers and photos. Target: under 15 seconds from opening
the app to a saved entry.

- [x] **LogEntry entity** — new schema `log-entry.schema.json`:
      id, growId (required), at (timestamp), category enum (watering /
      feeding / training / defoliation / treatment / observation /
      note / other), text (required), optional nullable numbers for the
      frequent cases (amountL, ph, ec, tempC), plantIds[] (optional),
      locationId (optional). Additive — old bundles import unchanged.
- [x] **Photos on entries** — photo schema: plantId becomes nullable,
      optional logEntryId; grow-level and entry-level images work in the
      existing IndexedDB store + export/import (base64, as before).
      Fixed a pre-existing bug on the way: photo.schema.json demanded
      blob as string, but live records store real Blobs — photo upload
      from the Plants page never passed validation.
- [x] **Quick-add UI** — "+ Log" button in the topbar on every page
      (defaults to the active grow, remembers the last used grow) and
      "+ Log entry" on the History page; dialog with category, text,
      optional numbers, plant multi-select, location, photo picker;
      errors render in the dialog
- [x] **Journal rendering** — entries flow into History (per-grow list),
      Timeline (per-day cells) and the shared event popup (numbers,
      linked-photo thumbnails, delete entry incl. its photos) via the
      existing domain modules
- [x] **Tests** — log-entry domain (pure builder), photo/log link
      round-trip, quick-add dialog create flows (minimal + full + no
      grow error), history + timeline integration, example dataset
      extension (4 journal entries + linked photo)

Deferred (noted, not built here): activity presets with saved defaults
(e.g. one-click "standard watering"), task completion from a log entry,
watering-cadence hints ("last watered 3d ago").

### Phase 2.7 — refinements (user feedback after daily use)

- [x] **Fix "Delete all data"** — root cause: `logEntries` was added
      without bumping IndexedDB `DB_VERSION`, so existing browsers never
      ran `onupgradeneeded`, the store was missing and every transaction
      (incl. wipe) threw NotFoundError. DB_VERSION is now 3, the upgrade
      creates missing stores and drops unknown ones; regression test
      guards the version bump.
- [x] **Default grow** — `grow.isDefault` flag (checkbox in the grow
      form, single default enforced on save, ★ marker in lists);
      all grow selects (plants, tasks, equipment, history, quick-log)
      prefill the default grow, fallback first active.
- [x] **Harvest details on cured plants** — optional grams of buds,
      leaves, sugar leaves and stems plus smell/terpenes text on the
      plant (edit dialog + detail display); grow harvest summary sums
      the parts per grow.
- [x] **"Fermented" stage/status** — fermentation can change a lot:
      new plant status + stage (schemas, stage lists, isHarvested,
      stage-duration order, i18n).
- [x] **Multi-category journal entries** — `logEntry.categories[]`
      (min 1; legacy single `category` still read); the +Log dialog has
      category chips with multi-select, and only the fields matching the
      picked categories are shown (amount/pH/EC for watering/feeding/
      treatment, EC only for watering/feeding, temp for observation/
      note/other).
- [x] **Settings page + "When" prefill** — browser-local settings store
      (`static/js/model/settings-store.js`, localStorage — deliberately
      not part of the data bundle): language, date format (ISO / day
      first / month first / long), hour format (24h / 12h AM-PM),
      timezone (local or IANA zone). Saving applies instantly (page
      reload). The +Log dialog's "When" is a text input rendered in the
      configured format (a real browser ignores settings for
      datetime-local) and parses back in the settings zone; history
      headers, plant detail and the event popup render dates through the
      new format module (`static/js/model/format.js`).
      Settings page at /settings/.
- [x] **Category-matched log fields + per-category detail fields** —
      the +Log dialog shows only the fields matching the picked
      categories: watering (amount/pH/EC/temp), feeding (+product/dose),
      training (technique, stress level), defoliation (style, %,
      stress), treatment (amount/product/dose/stress), observation
      (temp/humidity), fermentation (temp/humidity/fermentation note).
      New optional log fields: product, dose, technique, stressLevel,
      defoliationStyle, defoliationPercent, humidityPct,
      fermentationNote. New log category "fermentation".
- [x] **Popup UX + traceability** — dialogs close on backdrop click
      (shared `ui.wireBackdropClose`; all Cancel/Close buttons removed);
      the event popup shows the entity's change log: the adapter records
      an append-only edit trail (`entityEdits` store, `DB_VERSION = 4`)
      with a per-put diff (created / key: from → to) for every entity —
      e.g. "sex: unknown → female" — surfaced in the event popup.
- [x] **Global date-input refactor** — `data-date-input` /
      `data-datetime-input` inputs (grow start/end incl. "Create grow"
      prefill, germination, harvest, purchase, due, "When") all
      fill/parse through `dateInput.js` in one place; settings apply
      globally without touching page code.
- [x] **Equipment grid rework** — list view replaced by a grid of
      square tiles: picture or emoji in the centre (category emoji as
      fallback), short name in the lower third, meta line (category ·
      location); first tile is the + tile to add. Hovering shows a gear
      in the upper-left corner (edit). The dialog picks an emoji from a
      grid or uploads an image (data URL, 512 KB cap — schema:
      `equipment.icon` / `equipment.image`, mutually exclusive with a
      fallback to category emoji); items stay categorizable (filter +
      per-category default emoji) and location assignment moved into the
      dialog (from–to history preserved).
- [x] **Quality-of-life pass** — calendar/clock picker on every date
      field (`data-date-input`/`data-datetime-input` popover: month
      grid + hour/minute selects honoring dateFormat/hourFormat/
      timezone; `static/js/model/date-picker.js`); dialog forms in a
      wrapping grid so fields sit at natural width instead of
      full-dialog width; missing i18n keys fixed (equipment + tile
      label); Tasks gains a Kanban board view (open/done/skipped
      columns, click-to-move cards, board/list toggle) as an addition
      to the list; "fermented" added to the task stage-hint select.
- [x] **Date-input regression fix + DnD + timeline links** —
      bare `data-date-input` attributes were misread as datetime
      fields, so germinationDate/harvestedAt got full ISO timestamps on
      save (the reported "Validation failed: germinationDate invalid
      date" on a sex-only edit); dateInput now detects date-only by
      attribute presence and `set(input, null)` leaves optional fields
      empty instead of prefilling "now". Kanban cards drag-and-drop
      between columns (HTML5 DnD, drop highlight, move = status change
      incl. protocol). Status filter shows only in list view. Timeline
      chips link to their entity (plant detail / grow detail / grow
      history) via deep links; the change log in the event popup
      protocols sex changes and everything else.

## Phase 3 — Sensors
- [ ] Sensor entity (already a category in Equipment)
- [ ] Ingestion endpoint `POST /api/v1/readings` (auth: device token)
- [ ] Bridge adapters (MQTT / Home-Assistant / generic webhook)
- [ ] Climate dashboards per location (temp/humidity/light/VPD)
- [ ] Threshold alerts (browser notification / email)

## Phase 4 — Multi-user / hosted

**Goal:** a real multi-user instance on Daniel's VPS (alongside
pompui.de), where every account sees only its own data. The local
browser app keeps working as the offline/default client.

### 4.1 Server foundations — DONE (2026-10-21)
- [x] Django models mirroring `schemas/*.schema.json` 1:1 (field names
      identical) — a `Workspace` FK on every entity (the server-side
      counterpart of a data profile)
- [x] `django-ninja` REST API under `/api/v1`: one endpoint per
      entity, same JSON shapes as the browser bundle, every payload
      validated against the same JSON Schema files the browser uses
- [x] Auth as a DEPLOYMENT SWITCH: `LEAFGURU_AUTH=none` (no accounts,
      one shared workspace — for self-hosting) or `=required` (a
      session per account, one workspace each — for the hosted
      service). Session cookie for the browser client.
- [x] No public self-sign-up: the operator creates the account
      (`python manage.py create_account <user> <email>`)
- [x] `LEAFGURU_DATABASE_URL` for Postgres; SQLite by default so a
      self-hoster needs zero configuration
- [x] Media storage for photos (`media/`; an S3-compatible backend
      can be plugged in later)

### 4.2 ServerAdapter (the client flip) — DONE (2026-10-21)
- [x] `ServerAdapter` implements the existing `StorageAdapter`
      interface — no page code changed
- [x] Per-user isolation is a workspace filter in the API layer, the
      same place the profile filter is today
- [x] Photo upload to `media/` instead of IndexedDB blobs
- [x] Offline fallback: the app stays local unless the user chooses
      the server; the Data page shows where the data lives and offers
      the one-time move

### 4.3 Migration — DONE (2026-10-21)
- [x] One-time local→server import: export the local bundle, import
      it server-side (the ids are the client's own, so they survive)
- [x] Idempotent: the import replaces the target workspace's
      contents, so re-running it is safe
- [x] Photos are uploaded one by one; a photo that fails does not
      abort the import
- [ ] Per-profile import: each browser profile can land in its own
      server-side workspace (the profile → workspace mapping)

### 4.4 Operations — partly done
- [ ] Server-side backups (Postgres dump + media archive)
- [x] Profile → workspace mapping: the client sends the active
      workspace in the `X-LeafGuru-Workspace` header, so the demo
      profile stays a demo on the server
- [ ] Rate limiting + upload size limits (only needed once public
      sign-up exists — invite-only does not need it)

### 4.5 Decision — invite-only for v1 (recommended)
- **Invite-only**: the operator creates the account. No public
  sign-up means no abuse handling, no rate limiting on registration
  and no account-deletion path — the smallest sensible scope for a
  paid service that is operated by hand.
- Public sign-up stays possible later: the API already separates
  "who is signed in" from "may register" (`/api/v1/auth/status/`
  reports `authRequired`), so a registration endpoint can be added
  without touching the data model.
- A self-hoster who wants accounts can run the same instance with
  `LEAFGURU_AUTH=required` and create accounts by hand.

### 4.6 Phasing
The order matters: models → API → ServerAdapter → import → auth polish.
Each step is independently shippable, and the local app keeps working
throughout — a half-finished server side never breaks the client.

## Phase 5 — Polish
- [ ] Additional locales via i18n JSON files
- [ ] Mobile PWA (installable, offline)
- [ ] Optional public instance

## Phase 6 — Design pass (last: design follows function)
- [ ] **Dedicated CSS/UI design pass** — only once the feature set is
      final: typography, spacing system, color accents per entity, dialog
      polish, animations. Current CSS is intentionally minimal placeholder
      styling. Doing this last avoids re-styling every new phase's UI.
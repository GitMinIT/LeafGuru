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

## Phase 2 — Insights
- [ ] Stage countdowns / day counters vs. strain template durations
      (auto from StageLog + stageDurations)
- [ ] Harvest statistics (yield, duration per stage, costs)
- [ ] Cost tracking per grow (equipment amortization)
- [ ] Timeline/calendar visualization
- [ ] Growth charts: multi-series (all plants of a grow), expected-height
      overlay from strain template

## Phase 3 — Sensors
- [ ] Sensor entity (already a category in Equipment)
- [ ] Ingestion endpoint `POST /api/v1/readings` (auth: device token)
- [ ] Bridge adapters (MQTT / Home-Assistant / generic webhook)
- [ ] Climate dashboards per location (temp/humidity/light/VPD)
- [ ] Threshold alerts (browser notification / email)

## Phase 4 — Multi-user / hosted
- [ ] Registration + auth (allauth), per-user data isolation
- [ ] Postgres deployment profile, object storage for photos
- [ ] ServerAdapter flip (same JSON model), one-time local→server import
- [ ] Server-side backups

## Phase 5 — Polish
- [ ] Additional locales via i18n JSON files
- [ ] Mobile PWA (installable, offline)
- [ ] Optional public instance

## Phase 6 — Design pass (last: design follows function)
- [ ] **Dedicated CSS/UI design pass** — only once the feature set is
      final: typography, spacing system, color accents per entity, dialog
      polish, animations. Current CSS is intentionally minimal placeholder
      styling. Doing this last avoids re-styling every new phase's UI.
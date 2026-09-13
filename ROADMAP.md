# LeafGuru — Roadmap

## Phase 1 — MVP (local-first) ✅ (storage core; entity pages partially done)
- [x] Django shell project (standalone Docker: nginx + gunicorn)
- [x] Data model JSON schemas (`schemas/`), Ajv validation client-side
- [x] StorageAdapter interface + LocalAdapter (IndexedDB + localStorage)
- [x] JSON import/export (full state, versioned, schema-validated)
- [x] Dashboard: plants by stage, due tasks (minimal)
- [x] Locations/Equipment/Strains/Tasks: basic schema-driven CRUD
- [x] Plants: CRUD, stage timeline (StageLog), location change log
- [x] Measurements (height etc.) — text list in plant detail
- [x] Photos per plant (IndexedDB blobs, gallery view)
- [x] i18n loader, `en.json` only

## Phase 1.5 — Entity pages: make them actually work (NOW)
Plants is the model; the other pages are bare scaffolds. Goal: each page
gets the cross-entity wiring and actions its data model implies.

- [ ] **Tasks**: plant + location selectors in form (schema has plantId/
      locationId — currently unsettable), stage hint, inline mark
      done/skipped, overdue highlighting on the list, edit of open tasks
- [ ] **Equipment**: location-assignment editor (assign/unassign with
      from–to history per schema `locationAssignments[]`), cost +
      currency fields, fix mislabeled cost field
- [ ] **Strains**: stageDurations as proper per-stage fields (seedling,
      vegetative, flowering — labeled correctly), used by plant stage
      countdown later
- [ ] **Locations**: equipment currently here, plants currently here
      (cross-entity back-references on detail)
- [ ] **Data page**: verify export/import round-trip with all entities
      (photos incl.), show record counts per entity
- [ ] **Dashboard**: remove scaffold note, fix plants-by-stage section
      bug, show overdue/due today counts + active locations properly
- [ ] Lists: sort by column, filter/search box, consistent action buttons
- [ ] Measurements: add/edit/remove from plant detail (currently read-only
      list? verify), simple growth chart (SVG, no deps)
- [ ] End-to-end pass in browser: create location → equipment → strain →
      plant → move → measure → task → complete task → export/import

## Phase 2 — Insights
- [ ] Growth charts per plant (measurement history)
- [ ] Stage countdowns / day counters (auto from StageLog)
- [ ] Harvest statistics (yield, duration per stage, costs)
- [ ] Cost tracking per grow (equipment amortization)
- [ ] Timeline/calendar visualization

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
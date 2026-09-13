# LeafGuru — Roadmap

## Phase 1 — MVP (local-first)
- [ ] Django shell project (standalone Docker: nginx + gunicorn)
- [ ] Data model JSON schemas (`schemas/`), Ajv validation client-side
- [ ] StorageAdapter interface + LocalAdapter (IndexedDB + localStorage)
- [ ] JSON import/export (full state, versioned, schema-validated)
- [ ] Dashboard: active grows at a glance (plants by stage, due tasks)
- [ ] Locations: CRUD, indoor/outdoor, size, active flag
- [ ] Equipment: CRUD, categories, location assignment history
- [ ] Strain templates: CRUD, expected stage durations/height
- [ ] Plants: CRUD, stage timeline (StageLog), location change log
- [ ] Measurements (height etc.) + simple growth chart
- [ ] Task planning: tasks per plant/location, due dates, dashboard list
- [ ] Photos per plant (IndexedDB blobs, gallery view)
- [ ] i18n loader, `en.json` only
- [ ] German legal-neutral wording, AI-notice discipline for docs

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
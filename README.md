# LeafGuru

Plan and track your grow: locations, equipment, strain templates, plants
with stage timelines, tasks, measurements and photos — local-first in your
browser, with JSON import/export and a path to a hosted multi-user version.

**Status:** planning complete, phase-1 scaffolding in progress. See
[ARCHITECTURE.md](ARCHITECTURE.md) and [ROADMAP.md](ROADMAP.md).

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

## Repo layout

```
core/           Django app (shell, views, export/import stubs)
schemas/        JSON schemas — single source of truth for the data model
static/js/
  adapter/      StorageAdapter interface + LocalAdapter (IndexedDB)
  i18n/         loader + en.json (all UI strings)
templates/      Django templates
secrets/        git-ignored (github.token, later app secrets)
```

## Licence

[MIT](LICENSE)
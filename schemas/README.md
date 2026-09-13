# schemas/ — single source of truth for the LeafGuru data model

One JSON Schema per entity + `bundle.json` describing the full export/state
shape. Used by:

- client-side validation (Ajv) in the storage adapter
- import/export validation
- phase 2: django-ninja/pydantic schemas mirror these 1:1

Schema versioning: every export carries `meta.schemaVersion`; migrations
convert old exports on import. See ARCHITECTURE.md.

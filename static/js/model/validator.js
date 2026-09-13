/**
 * LeafGuru — lightweight JSON-Schema (draft-07 subset) validator.
 *
 * Covers exactly the constructs used by schemas/*.schema.json:
 * type (incl. [type, "null"]), enum/const, required, properties,
 * additionalProperties:false, items, minLength/maxLength,
 * minimum/maximum, format: uuid/date/date-time.
 *
 * Returns {valid: true} or {valid: false, errors: [{path, message}]}.
 * Zero dependencies — runs in the browser before anything is written.
 */
(function () {
  "use strict";

  const FORMATS = {
    uuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
    date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
    "date-time": (v) => !Number.isNaN(Date.parse(v)) && /[zZ]|[+-]\d{2}:?\d{2}$/.test(v)
  };

  function typeOk(value, type) {
    switch (type) {
      case "object": return value && typeof value === "object" && !Array.isArray(value);
      case "array": return Array.isArray(value);
      case "string": return typeof value === "string";
      case "number": return typeof value === "number" && !Number.isNaN(value);
      case "integer": return Number.isInteger(value);
      case "boolean": return typeof value === "boolean";
      case "null": return value === null;
      default: return true;
    }
  }

  function validate(value, schema, path, errors) {
    if (schema === true) return;
    if (schema === false) { errors.push({ path, message: "value not allowed" }); return; }

    // type: string or [string, "null"]
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some((t) => typeOk(value, t))) {
        errors.push({ path, message: `expected type ${types.join("|")}, got ${value === null ? "null" : typeof value}` });
        return;
      }
      // treat null as OK — further checks apply to non-null values
      if (value === null) return;
    }

    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({ path, message: `must be one of: ${schema.enum.map(String).join(", ")}` });
      return;
    }
    if (schema.const !== undefined && value !== schema.const) {
      errors.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
      return;
    }
    if (typeof value === "string") {
      if (schema.minLength !== undefined && value.length < schema.minLength)
        errors.push({ path, message: `shorter than minLength ${schema.minLength}` });
      if (schema.maxLength !== undefined && value.length > schema.maxLength)
        errors.push({ path, message: `longer than maxLength ${schema.maxLength}` });
      if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format](value))
        errors.push({ path, message: `invalid ${schema.format}: ${value}` });
    }
    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum)
        errors.push({ path, message: `below minimum ${schema.minimum}` });
      if (schema.maximum !== undefined && value > schema.maximum)
        errors.push({ path, message: `above maximum ${schema.maximum}` });
    }

    if (schema.type === "object" || schema.properties) {
      if (schema.required) {
        for (const key of schema.required) {
          if (value == null || value[key] === undefined)
            errors.push({ path: `${path}.${key}`, message: "required" });
        }
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (schema.additionalProperties === false) {
          for (const key of Object.keys(value)) {
            if (!schema.properties || !(key in schema.properties))
              errors.push({ path: `${path}.${key}`, message: "unknown property" });
          }
        }
        for (const [key, sub] of Object.entries(schema.properties ?? {})) {
          if (value && value[key] !== undefined) validate(value[key], sub, `${path}.${key}`, errors);
        }
      }
    }

    if (schema.type === "array" && Array.isArray(value) && schema.items) {
      value.forEach((item, i) => validate(item, schema.items, `${path}[${i}]`, errors));
    }
  }

  window.LeafGuru = window.LeafGuru || {};
  window.LeafGuru.validator = {
    validate(value, schema) {
      const errors = [];
      validate(value, schema, "$", errors);
      return errors.length ? { valid: false, errors } : { valid: true, errors: [] };
    },
    /** validate a full bundle (meta + all entities) against the per-entity schemas */
    validateBundle(bundle, entitySchemas) {
      const errors = [];
      if (!bundle || typeof bundle !== "object") return { valid: false, errors: [{ path: "$", message: "bundle must be an object" }] };
      const requiredTop = ["meta", "grows", "locations", "equipment", "strainTemplates", "plants"];
      for (const key of requiredTop) {
        if (bundle[key] === undefined) errors.push({ path: `$.${key}`, message: "required" });
      }
      const meta = bundle.meta ?? {};
      if (meta.app !== "LeafGuru") errors.push({ path: "$.meta.app", message: "must be LeafGuru" });
      if (meta.appVersion !== undefined && typeof meta.appVersion !== "string")
        errors.push({ path: "$.meta.appVersion", message: "must be a string" });
      if (meta.schemaVersion !== 1) errors.push({ path: "$.meta.schemaVersion", message: "unsupported schemaVersion (want 1)" });
      const ENTITY_FILES = {
        grows: "grow.schema.json",
        locations: "location.schema.json",
        equipment: "equipment.schema.json",
        strainTemplates: "strain-template.schema.json",
        plants: "plant.schema.json",
        stageLogs: "stage-log.schema.json",
        measurements: "measurement.schema.json",
        locationChanges: "location-change.schema.json",
        tasks: "task.schema.json",
        photos: "photo.schema.json"
      };
      for (const [entity, file] of Object.entries(ENTITY_FILES)) {
        const schema = entitySchemas[file];
        if (!schema) continue;
        (bundle[entity] ?? []).forEach((rec, i) => validate(rec, schema, `$.${entity}[${i}]`, errors));
      }
      return errors.length ? { valid: false, errors } : { valid: true, errors: [] };
    }
  };
})();
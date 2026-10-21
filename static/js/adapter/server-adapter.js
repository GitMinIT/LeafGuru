/**
 * LeafGuru — ServerAdapter.
 *
 * Talks to the LeafGuru REST API instead of IndexedDB. It implements the
 * same StorageAdapter interface as LocalAdapter, so no page code changes
 * when the app runs against a server.
 *
 * The server decides how it behaves:
 *   LEAFGURU_AUTH=none     -> no login, one shared workspace (a
 *                              self-hosted instance on a LAN)
 *   LEAFGURU_AUTH=required -> login required, one workspace per account
 *                              (the hosted service)
 *
 * The client discovers the mode at runtime via /api/v1/auth/status/ and
 * falls back to the local adapter when there is no server (the app also
 * works as a pure browser app).
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const API = "/api/v1";

  /**
   * The CSRF token for write requests.
   *
   * The shell puts it into a <meta name="csrf-token"> tag (Django only
   * sets the cookie when a template touches the token, so the meta tag is
   * what guarantees it exists). The cookie is the fallback.
   */
  function csrfToken() {
    const meta = document.querySelector("meta[name=\"csrf-token\"]");
    if (meta?.content) return meta.content;
    const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  class ServerAdapter extends window.LeafGuru.StorageAdapter {
    constructor({ base = API } = {}) {
      super();
      this.base = base;
      this.status = null;
    }

    /** @private */
    async _request(path, { method = "GET", body, headers = {} } = {}) {
      const init = {
        method,
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          ...headers,
        },
      };
      // the active workspace (= the server-side profile) travels with
      // every request; without it the server uses the default workspace
      const workspace = window.LeafGuru.workspaces?.activeId?.();
      if (workspace) init.headers["X-LeafGuru-Workspace"] = workspace;
      if (body !== undefined) {
        if (body instanceof FormData) {
          init.body = body;
        } else {
          init.headers["Content-Type"] = "application/json";
          init.body = JSON.stringify(body);
        }
      }
      if (method !== "GET" && method !== "HEAD") {
        // Django's CSRF protection: send the token as a header
        init.headers["X-CSRFToken"] = csrfToken();
      }
      const res = await fetch(`${this.base}${path}`, init);
      if (res.status === 401 || res.status === 403) {
        const error = new Error("authentication required");
        error.status = res.status;
        throw error;
      }
      if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`;
        try {
          const payload = await res.json();
          if (payload?.detail) detail = payload.detail;
        } catch { /* not json */ }
        const error = new Error(detail);
        error.status = res.status;
        throw error;
      }
      if (res.status === 204) return null;
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("application/json")) return res.json();
      return res.text();
    }

    // --- entity CRUD ----------------------------------------------------

    async list(entity) {
      return this._request(`/${entity}/`);
    }

    async get(entity, id) {
      try {
        return await this._request(`/${entity}/${id}/`);
      } catch (e) {
        if (e.status === 404) return null;
        throw e;
      }
    }

    async put(entity, record) {
      const isNew = !record.id;
      if (isNew) {
        record.id = window.LeafGuru.uuid();
        if (!record.createdAt) record.createdAt = new Date().toISOString();
      }
      record.updatedAt = new Date().toISOString();

      // photos: the bytes go to the server as a file, the record as JSON
      if (entity === "photos" && record.blob instanceof Blob) {
        const form = new FormData();
        form.append("file", record.blob, "photo");
        const meta = { ...record };
        delete meta.blob;
        form.append("payload", new Blob([JSON.stringify(meta)], { type: "application/json" }));
        const result = await this._request("/photos/", { method: "POST", body: form });
        return { ...record, blob: result.url ?? null };
      }

      const check = window.LeafGuru.validator.validate(
        record, window.LeafGuru.schemas[window.LeafGuru.ENTITIES_META[entity]]);
      if (!check.valid) {
        throw new window.LeafGuru.LeafGuruValidationError(check.errors);
      }
      const path = `/${entity}/${record.id}/`;
      return isNew
        ? this._request(`/${entity}/`, { method: "POST", body: record })
        : this._request(path, { method: "PUT", body: record });
    }

    async delete(entity, id) {
      return this._request(`/${entity}/${id}/`, { method: "DELETE" });
    }

    // --- bundle ---------------------------------------------------------

    async exportBundle() {
      return this._request("/bundle/");
    }

    async importBundle(bundle) {
      const check = window.LeafGuru.validator.validateBundle(
        bundle, window.LeafGuru.schemas);
      if (!check.valid) {
        throw new window.LeafGuru.LeafGuruValidationError(check.errors);
      }
      return this._request("/bundle/", { method: "POST", body: bundle });
    }

    /** server-side storage usage is not meaningful -> 0 */
    async usage() {
      return { bytes: 0, quota: 0 };
    }

    /** wipe the workspace (the server replaces its contents) */
    async wipe() {
      const bundle = await this.exportBundle();
      const empty = { ...bundle };
      for (const key of Object.keys(empty)) {
        if (Array.isArray(empty[key])) empty[key] = [];
      }
      await this.importBundle(empty);
    }
  }

  window.LeafGuru.ServerAdapter = ServerAdapter;
  window.LeafGuru.serverCsrfToken = csrfToken;
})();

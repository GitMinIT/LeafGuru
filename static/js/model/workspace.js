/**
 * LeafGuru — workspace abstraction (profiles on top of the adapter).
 *
 * A "profile" is an independent set of grow data. Where it lives depends
 * on the storage mode:
 *
 *   local mode  -> a profile is an IndexedDB database (local-adapter.js)
 *   server mode -> a profile is a server workspace (an API resource)
 *
 * Both are "a named, independent set of grow data", so the UI does not
 * care which one it is. This module hides the difference and gives the
 * pages one API: list / active / setActive / create / remove / rename.
 *
 * The server adapter sends the active workspace id in a header; the
 * local adapter uses it as its database name.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const KEY_ACTIVE_WORKSPACE = "leafguru.activeWorkspace";

  const isServer = () => !!window.LeafGuru.serverStatus?.server;

  /** the active profile/workspace id, per mode */
  function activeId() {
    if (isServer()) {
      const id = localStorage.getItem(KEY_ACTIVE_WORKSPACE);
      return id || null;   // null -> the server's default workspace
    }
    return window.LeafGuru.profiles?.activeId() ?? "default";
  }

  async function list() {
    if (isServer()) {
      const res = await fetch("/api/v1/workspaces/", {
        credentials: "same-origin",
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) return [];
      const list = await res.json();
      // make sure the active one is in the list (the default workspace
      // may not have been created explicitly yet)
      const current = activeId();
      if (current && !list.some((w) => w.id === current)) {
        list.unshift({ id: current, name: "Default" });
      }
      return list;
    }
    return (window.LeafGuru.profiles?.list() ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      owner: null,
    }));
  }

  function setActive(id) {
    if (isServer()) {
      localStorage.setItem(KEY_ACTIVE_WORKSPACE, id);
      return id;
    }
    window.LeafGuru.profiles.setActive(id);
    return id;
  }

  async function create(name) {
    if (isServer()) {
      const res = await fetch("/api/v1/workspaces/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-CSRFToken": window.LeafGuru.serverCsrfToken?.() ?? "",
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`could not create the workspace (${res.status})`);
      return res.json();
    }
    return window.LeafGuru.profiles.create(name);
  }

  async function remove(id) {
    if (isServer()) {
      const res = await fetch(`/api/v1/workspaces/${id}/`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "X-CSRFToken": window.LeafGuru.serverCsrfToken?.() ?? "" },
      });
      if (!res.ok) throw new Error(`could not delete the workspace (${res.status})`);
      if (activeId() === id) localStorage.removeItem(KEY_ACTIVE_WORKSPACE);
      return true;
    }
    await window.LeafGuru.profiles.removeWithData(id);
    return true;
  }

  async function rename(id, name) {
    if (isServer()) {
      // renaming a workspace is not part of the API yet — the client
      // keeps the name locally so the switcher stays readable
      localStorage.setItem(`leafguru.workspaceName.${id}`, name);
      return { id, name };
    }
    return window.LeafGuru.profiles.rename(id, name);
  }

  /** the name of a profile/workspace (server names come from the API) */
  async function nameOf(id) {
    const cached = localStorage.getItem(`leafguru.workspaceName.${id}`);
    if (cached) return cached;
    const all = await list();
    return all.find((w) => w.id === id)?.name ?? id;
  }

  /**
   * Copy a profile/workspace into a new one.
   * The copy goes through export/import, so photos come along.
   */
  async function duplicate(id, name) {
    if (isServer()) {
      const source = new window.LeafGuru.ServerAdapter();
      const target = await create(name);
      const bundle = await source.exportBundle();
      // the target workspace is selected by the header
      const created = await window.LeafGuru.workspaces.setActive(target.id);
      const targetAdapter = new window.LeafGuru.ServerAdapter();
      await targetAdapter.importBundle(bundle);
      window.LeafGuru.workspaces.setActive(created);
      return target;
    }
    return window.LeafGuru.profiles.duplicate(id, name);
  }

  window.LeafGuru.workspaces = {
    isServer,
    list,
    activeId,
    setActive,
    create,
    remove,
    rename,
    duplicate,
    nameOf,
  };

  /**
   * The profile API for the CURRENT storage mode.
   *
   * Local mode -> the IndexedDB profiles; server mode -> the server
   * workspaces. The list/create/remove/duplicate calls are async in both
   * cases (the server ones are network calls), so callers await them.
   */
  window.LeafGuru.profileApi = () =>
    (isServer() ? window.LeafGuru.workspaces : window.LeafGuru.profiles);
})();

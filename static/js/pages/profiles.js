/**
 * LeafGuru — profile management (Data page).
 *
 * A profile is an independent set of grow data. Where it lives depends
 * on the storage mode:
 *   local mode  -> an IndexedDB database in this browser
 *   server mode -> a workspace on the server
 *
 * The panel creates, renames, duplicates, switches and deletes them.
 * In local mode the default profile holds the data that was already in
 * the browser and cannot be deleted; in server mode every workspace can
 * be deleted.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const $ = (sel) => document.querySelector(sel);

    const listEl = $("[data-profile-list]");
    const statusEl = $("[data-profile-status]");
    if (!listEl || !window.LeafGuru.profileApi) return;

    // the mode decides which store the profiles live in (local
    // IndexedDB vs server workspaces) - know it before binding
    await window.LeafGuru.ensureServerStatus?.();

    const api = window.LeafGuru.profileApi();
    const isServer = window.LeafGuru.isServerMode?.() ?? false;

    /** how many records does a profile hold? */
    async function countRecords(profileId) {
      try {
        // the adapter must be bound to THIS row's profile -- otherwise
        // every row would show the counts of the active one
        const storage = isServer
          ? new window.LeafGuru.ServerAdapter({ workspace: profileId })
          : new window.LeafGuru.LocalAdapter({ profileId });
        const [plants, grows, logs] = await Promise.all([
          storage.list("plants"), storage.list("grows"), storage.list("logEntries"),
        ]);
        return { plants: plants.length, grows: grows.length, logs: logs.length };
      } catch {
        return { plants: 0, grows: 0, logs: 0 };
      }
    }

    async function render() {
      listEl.replaceChildren();
      const activeId = api.activeId();
      const all = await api.list();

      for (const profile of all) {
        const row = document.createElement("li");
        row.className = "profile-row";
        if (profile.id === activeId) row.classList.add("profile-row--active");

        const main = document.createElement("div");
        main.className = "profile-row__main";

        const name = document.createElement("span");
        name.className = "profile-row__name";
        name.textContent = profile.name;
        if (profile.id === activeId) {
          const badge = document.createElement("span");
          badge.className = "profile-badge";
          badge.textContent = t("profile.active");
          name.append(" ", badge);
        }

        const counts = await countRecords(profile.id);
        const meta = document.createElement("span");
        meta.className = "profile-row__meta muted";
        meta.textContent = `${counts.grows} ${t("nav.grows").toLowerCase()} · `
          + `${counts.plants} ${t("nav.plants").toLowerCase()} · `
          + `${counts.logs} ${t("log.title").toLowerCase()}`;

        main.append(name, meta);

        const actions = document.createElement("span");
        actions.className = "profile-row__actions";

        // duplicate: copy this profile's data into a new one
        const dup = document.createElement("button");
        dup.type = "button";
        dup.className = "btn--ghost";
        dup.textContent = t("profile.duplicate");
        dup.title = t("profile.duplicateHint");
        dup.addEventListener("click", async () => {
          const next = window.prompt(
            t("profile.duplicatePrompt", { name: profile.name }),
            `${profile.name} (copy)`);
          if (!next || !next.trim()) return;
          try {
            const created = await api.duplicate(profile.id, next.trim());
            statusEl.textContent = t("profile.duplicated", { name: created.name });
            render();
          } catch (e) {
            statusEl.textContent = e.message;
          }
        });
        actions.append(dup);

        if (profile.id !== activeId) {
          const use = document.createElement("button");
          use.type = "button";
          use.className = "btn--ghost";
          use.textContent = t("common.use") ?? "Use";
          use.addEventListener("click", () => {
            api.setActive(profile.id);
            location.reload();
          });
          actions.append(use);
        }

        // the default profile holds the existing local data -> keep it
        const isDefault = profile.id === window.LeafGuru.profiles?.DEFAULT_ID;
        if (!isDefault) {
          const rename = document.createElement("button");
          rename.type = "button";
          rename.className = "btn--ghost";
          rename.textContent = t("profile.rename");
          rename.addEventListener("click", async () => {
            const next = window.prompt(t("profile.renamePrompt"), profile.name);
            if (next && next.trim()) {
              await api.rename(profile.id, next.trim());
              statusEl.textContent = t("profile.renamed");
              render();
            }
          });
          actions.append(rename);

          const del = document.createElement("button");
          del.type = "button";
          del.className = "btn--danger";
          del.textContent = t("common.delete");
          del.addEventListener("click", async () => {
            const ok = window.confirm(
              t("profile.deleteConfirm", { name: profile.name }));
            if (!ok) return;
            try {
              await api.remove(profile.id);
              statusEl.textContent = t("profile.deleted");
              render();
            } catch (e) {
              statusEl.textContent = e.message;
            }
          });
          actions.append(del);
        }

        row.append(main, actions);
        listEl.append(row);
      }
    }

    const newBtn = $("[data-profile-new]");
    if (newBtn) {
      newBtn.addEventListener("click", async () => {
        const name = window.prompt(t("profile.newPrompt"), "");
        if (!name || !name.trim()) return;
        try {
          const created = await api.create(name.trim());
          statusEl.textContent = t("profile.created", { name: created.name });
          render();
        } catch (e) {
          statusEl.textContent = e.message;
        }
      });
    }

    await render();
  });
})();

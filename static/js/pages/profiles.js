/**
 * LeafGuru — profile management (Data page).
 *
 * A profile is an independent data set in this browser: its own plants,
 * tasks and journal, stored in its own IndexedDB database. This panel
 * creates, renames, switches and deletes profiles.
 *
 * The default profile holds the data that was already in the browser and
 * cannot be deleted. Deleting a profile removes its data too.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const $ = (sel) => document.querySelector(sel);
    const profiles = window.LeafGuru.profiles;

    const listEl = $("[data-profile-list]");
    const statusEl = $("[data-profile-status]");
    if (!listEl || !profiles) return;

    /** how many records does a profile hold? */
    async function countRecords(profileId) {
      try {
        const storage = new window.LeafGuru.LocalAdapter({ profileId });
        const plants = await storage.list("plants");
        const grows = await storage.list("grows");
        const logs = await storage.list("logEntries");
        return { plants: plants.length, grows: grows.length, logs: logs.length };
      } catch {
        return { plants: 0, grows: 0, logs: 0 };
      }
    }

    async function render() {
      listEl.replaceChildren();
      const activeId = profiles.activeId();

      for (const profile of profiles.list()) {
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

        if (profile.id !== activeId) {
          const use = document.createElement("button");
          use.type = "button";
          use.className = "btn--ghost";
          use.textContent = t("common.use") ?? "Use";
          use.addEventListener("click", () => {
            profiles.setActive(profile.id);
            location.reload();
          });
          actions.append(use);
        }

        if (profile.id !== profiles.DEFAULT_ID) {
          const rename = document.createElement("button");
          rename.type = "button";
          rename.className = "btn--ghost";
          rename.textContent = t("profile.rename");
          rename.addEventListener("click", () => {
            const next = window.prompt(t("profile.renamePrompt"), profile.name);
            if (next && next.trim()) {
              profiles.rename(profile.id, next.trim());
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
            await profiles.removeWithData(profile.id);
            statusEl.textContent = t("profile.deleted");
            render();
          });
          actions.append(del);
        }

        row.append(main, actions);
        listEl.append(row);
      }
    }

    const newBtn = $("[data-profile-new]");
    if (newBtn) {
      newBtn.addEventListener("click", () => {
        const name = window.prompt(t("profile.newPrompt"), "");
        if (!name || !name.trim()) return;
        const created = profiles.ensure(name.trim());
        statusEl.textContent = t("profile.created", { name: created.name });
        render();
      });
    }

    await render();
  });
})();

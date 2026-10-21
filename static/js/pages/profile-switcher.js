/**
 * LeafGuru — profile switcher (topbar).
 *
 * Lists the data profiles in the topbar and switches between them. A
 * profile is an independent set of grow data:
 *   local mode  -> an IndexedDB database in this browser
 *   server mode -> a workspace on the server
 *
 * Switching reloads the page with the new profile active.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    const sel = document.querySelector("[data-profile-switch]");
    if (!sel || !window.LeafGuru.profileApi) return;

    // The mode decides which store the profiles live in. Without this
    // the switcher binds to the local store before the server has
    // been probed -- so in server mode it listed the wrong profiles.
    await window.LeafGuru.ensureServerStatus?.();
    await window.LeafGuru.i18n?.init?.();

    const api = window.LeafGuru.profileApi();
    const t = (k, p) => window.LeafGuru.i18n?.t?.(k, p) ?? k;

    async function render() {
      let list = [];
      try {
        list = await api.list();
      } catch {
        list = [];
      }
      const active = api.activeId();
      sel.replaceChildren();
      for (const p of list) {
        const opt = new Option(p.name, p.id);
        if (p.id === active) opt.selected = true;
        sel.append(opt);
      }
      // "+ New" entry
      sel.append(new Option(t("profile.new") ?? "+ New profile…", "__new__"));
    }

    sel.addEventListener("change", async () => {
      const value = sel.value;
      if (value === "__new__") {
        const name = window.prompt(t("profile.newPrompt") ?? "Name for the new profile:");
        if (name && name.trim()) {
          try {
            const created = await api.create(name.trim());
            api.setActive(created.id);
            location.reload();
          } catch (e) {
            window.alert(e.message);
            render();
          }
        } else {
          render();
        }
        return;
      }
      if (value === api.activeId()) return;
      api.setActive(value);
      location.reload();
    });

    await render();

    // the profile list can change elsewhere on the page (create, rename,
    // delete) — keep the switcher in sync
    window.addEventListener("leafguru:profiles-changed", render);
  });
})();

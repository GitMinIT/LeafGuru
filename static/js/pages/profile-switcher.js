/**
 * LeafGuru — profile switcher (topbar).
 *
 * Lists the data profiles in the topbar and switches between them. A
 * profile is an independent data set (its own IndexedDB database), so
 * switching reloads the page with the new profile active.
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    const profiles = window.LeafGuru.profiles;
    const sel = document.querySelector("[data-profile-switch]");
    if (!sel || !profiles) return;

    const t = (k, p) => window.LeafGuru.i18n?.t?.(k, p) ?? k;

    function render() {
      const list = profiles.list();
      const active = profiles.activeId();
      sel.replaceChildren();
      for (const p of list) {
        const opt = new Option(p.name, p.id);
        if (p.id === active) opt.selected = true;
        sel.append(opt);
      }
      // "+ New" entry
      const add = new Option(t("profile.new") ?? "+ New profile…", "__new__");
      sel.append(add);
    }

    sel.addEventListener("change", async () => {
      const value = sel.value;
      if (value === "__new__") {
        const name = window.prompt(t("profile.newPrompt") ?? "Name for the new profile:");
        if (name && name.trim()) {
          const created = profiles.ensure(name.trim());
          profiles.setActive(created.id);
          location.reload();
        } else {
          render();
        }
        return;
      }
      if (value === profiles.activeId()) return;
      profiles.setActive(value);
      location.reload();
    });

    render();

    // the profile list can change elsewhere on the page (create, rename,
    // delete) — keep the switcher in sync
    window.addEventListener("leafguru:profiles-changed", render);
  });
})();

/**
 * LeafGuru — Tasks page controller (due dates feed the dashboard).
 */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", async () => {
    await window.LeafGuru.i18n.init();
    await window.LeafGuru.loadSchemas();
    window.LeafGuru.storage = new window.LeafGuru.LocalAdapter();
    const t = (k) => window.LeafGuru.i18n.t(k);

    const page = new window.LeafGuru.CrudPage({
      entity: "tasks",
      entityTitleKey: "task.title",
      listColumns: [
        { path: "title" },
        { path: "status", format: (v) => t("task." + v) },
        { path: "dueDate", format: (v) => v ?? "–" },
        { path: "priority", format: (v) => t("task.priority." + v) },
        { path: "description" }
      ],
      fields: [
        { path: "title", label: "common.name", type: "string", required: true },
        { path: "description", label: "common.notes", type: "string" },
        { path: "dueDate", label: "task.dueDate", type: "string", format: "date" },
        { path: "priority", label: "task.priority.low", type: "string" },
        { path: "status", label: "task.open", type: "string" }
      ]
    });

    const form = document.querySelector("[data-crud-dialog] form");
    const makeSelect = (inputName, options) => {
      const label = form.querySelector(`input[name="${inputName}"]`).closest("label");
      const select = document.createElement("select");
      select.name = inputName;
      for (const [value, key] of options) select.append(new Option(t(key), value));
      label.querySelector("input").replaceWith(select);
      return select;
    };
    const prioSelect = makeSelect("priority",
      Object.entries({ low: "task.priority.low", medium: "task.priority.medium", high: "task.priority.high" }));
    const statusSelect = makeSelect("status",
      Object.entries({ open: "task.open", done: "task.done", skipped: "task.skipped" }));
    const origOpenForm = page.openForm.bind(page);
    page.openForm = (record = null) => {
      origOpenForm(record);
      if (!record) { prioSelect.value = "medium"; statusSelect.value = "open"; }
    };

    await page.mount();
  });
})();
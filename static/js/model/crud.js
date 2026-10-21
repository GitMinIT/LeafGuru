/**
 * LeafGuru — schema-driven form + list builder (phase 1 CRUD core).
 *
 * A page declares: entity name, list columns and form fields (path, label
 * via i18n key, input type). renderList()/renderForm() build the DOM from
 * that spec; submit() validates via the entity JSON schema before saving.
 * No external framework — small, plain DOM code.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const t = (k, p) => window.LeafGuru.i18n.t(k, p);
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const child of children) node.append(child);
    return node;
  };

  /** map a schema property to <input type> */
  function inputType(prop) {
    const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;
    switch (prop.format) {
      case "date": return "date";
      case "date-time": return "datetime-local";
      case "uuid": return "text";
      default: break;
    }
    switch (type) {
      case "number": return "number";
      case "integer": return "number";
      case "boolean": return "checkbox";
      default: return "text";
    }
  }

  class CrudPage {
    /**
     * @param cfg {entity, container, listColumns:[{path,label,sortable?}], fields:[{path,label,required?,options?}],
     *   emptyHint, searchable?: boolean, searchPaths?: [path],
     *   rowActions?: (rec) => [HTMLElement] — extra buttons per row,
     *   onDelete?: async (rec) => boolean — return false to veto removal}
     */
    constructor(cfg) {
      this.cfg = cfg;
      this.storage = window.LeafGuru.storage;
      this.records = [];
      this._sort = { path: null, dir: 1 };
      this._search = "";
    }

    async refresh() {
      this.records = await this.storage.list(this.cfg.entity);
      this.renderList();
    }

    renderList() {
      const listEl = document.querySelector("[data-crud-list]");
      const emptyEl = document.querySelector("[data-crud-empty]");
      const rows = this._visibleRecords();
      listEl.replaceChildren();
      emptyEl.hidden = rows.length > 0;
      listEl.hidden = rows.length === 0;
      if (emptyEl.hidden === false && this._search) {
        emptyEl.textContent = t("common.noSearchResults");
      } else if (!this.cfg.keepEmptyHint) {
        emptyEl.textContent = this.cfg.emptyHint ?? t("messages.noRecords");
      }
      for (const rec of rows) {
        const row = document.createElement("li");
        row.className = "crud-row";
        for (const col of this.cfg.listColumns) {
          const cell = document.createElement("span");
          cell.className = `crud-cell crud-cell--${col.path.replace(/\W+/g, "-")}`;
          cell.textContent = this._cellText(rec, col);
          row.append(cell);
        }
        const actions = document.createElement("span");
        actions.className = "crud-cell crud-actions";
        if (this.cfg.rowActions) {
          for (const btn of this.cfg.rowActions(rec) ?? []) actions.append(btn);
        }
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = t("common.edit");
        editBtn.addEventListener("click", () => this.openForm(rec));
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = t("common.delete");
        delBtn.addEventListener("click", () => this._remove(rec));
        actions.append(editBtn, delBtn);
        row.append(actions);
        listEl.append(row);
      }
    }

    /** search filter + column sort (stable) over the cached records */
    _visibleRecords() {
      let rows = this.records;
      if (this._search) {
        const q = this._search.toLowerCase();
        const paths = this.cfg.searchPaths ?? this.cfg.listColumns.map((c) => c.path);
        rows = rows.filter((rec) => paths.some((p) =>
          String(this._cellValue(rec, p) ?? "").toLowerCase().includes(q)));
      }
      const { path, dir } = this._sort;
      if (path) {
        const col = this.cfg.listColumns.find((c) => c.path === path);
        rows = rows.slice().sort((a, b) => {
          const av = this._sortValue(a, col);
          const bv = this._sortValue(b, col);
          if (av == null && bv == null) return 0;
          if (av == null) return 1; // nulls last regardless of dir
          if (bv == null) return -1;
          const cmp = typeof av === "number" && typeof bv === "number"
            ? av - bv : String(av).localeCompare(String(bv));
          return dir * cmp || a.id.localeCompare(b.id);
        });
      } else {
        rows = rows.slice().sort((a, b) =>
          (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      }
      return rows;
    }

    _sortValue(rec, col) {
      const raw = this._cellValue(rec, col.path);
      if (raw == null || raw === "") return null;
      return typeof raw === "number" ? raw : String(raw);
    }

    /** toggle sort by column; expects a click on a [data-sort] element */
    sortBy(path) {
      if (this._sort.path === path) this._sort.dir = -this._sort.dir;
      else this._sort = { path, dir: 1 };
      this.renderList();
    }

    _cellValue(rec, path) {
      return path.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), rec);
    }

    _cellText(rec, col) {
      const raw = this._cellValue(rec, col.path);
      if (raw == null || raw === "") return "–";
      return col.format ? col.format(raw, rec) : String(raw);
    }

    openForm(record = null) {
      const dialog = document.querySelector("[data-crud-dialog]");
      const form = dialog.querySelector("form");
      form.reset();
      const errEl = dialog.querySelector("[data-crud-error]");
      if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
      form.dataset.editingId = record?.id ?? "";
      dialog.querySelector("[data-crud-form-title]").textContent =
        record ? `${t("common.edit")}: ${record.name ?? record.title ?? record.id.slice(0, 8)}` : `${t("common.create")} ${t(this.cfg.entityTitleKey)}`;
      for (const field of this.cfg.fields) {
        if (field.dynamic) { this._fillDynamic(field, record); continue; }
        this._fillField(form, field, record);
      }
      dialog.showModal();
    }

    _fillField(form, field, record) {
      const input = form.elements[field.path.replace(/\./g, "__")];
      if (!input) return;
      const value = record ? this._cellValue(record, field.path) : field.default;
      if (input.type === "checkbox") input.checked = Boolean(value ?? field.default ?? false);
      else input.value = value ?? field.default ?? "";
    }

    /**
     * fields may declare `dynamic: "growId"` — the page fills that <select>
     * itself (options depend on other entities); submit() passes its value
     * through as string|null and openForm pre-selects the record's value.
     */
    _fillDynamic(field, record) {
      const sel = document.querySelector(`[data-dynamic="${field.dynamic}"]`);
      if (!sel) return;
      const value = record ? this._cellValue(record, field.path) : null;
      sel.value = value ?? "";
    }

    async submit(event) {
      event.preventDefault();
      const form = event.target;
      const editingId = form.dataset.editingId || null;
      const record = editingId ? await this.storage.get(this.cfg.entity, editingId) : {};
      for (const field of this.cfg.fields) {
        if (field.dynamic) {
          const sel = document.querySelector(`[data-dynamic="${field.dynamic}"]`);
          record[field.path] = sel && sel.value !== "" ? sel.value : null;
          continue;
        }
        const input = form.elements[field.path.replace(/\./g, "__")];
        if (!input) continue;
        let value;
        if (input.type === "checkbox") value = input.checked;
        else if (input.type === "number") value = input.value === "" ? null : Number(input.value);
        else value = input.value === "" ? null : input.value;
        // nested paths: only one level supported by forms (enough for v1)
        const parts = field.path.split(".");
        if (parts.length === 1) record[parts[0]] = value;
        else {
          record[parts[0]] = record[parts[0]] ?? {};
          record[parts[0]][parts[1]] = value;
        }
      }
      try {
        if (editingId) record.id = editingId;
        await this.storage.put(this.cfg.entity, record);
        document.querySelector("[data-crud-dialog]").close();
        await this.refresh();
        this._flash(t("messages.saved"));
      } catch (e) {
        window.LeafGuru.ui.reportSubmitError(form, e);
      }
    }

    async _remove(record) {
      const label = record.name ?? record.title ?? record.id.slice(0, 8);
      if (!window.confirm(t("messages.confirmDelete", { name: label }))) return;
      if (this.cfg.onDelete && !(await this.cfg.onDelete(record))) return;
      await this.storage.delete(this.cfg.entity, record.id);
      await this.refresh();
      this._flash(t("messages.deleted"));
    }

    _flash(message) {
      const elx = document.querySelector("[data-crud-flash]");
      if (!elx) return;
      elx.textContent = message;
      elx.hidden = false;
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => { elx.hidden = true; }, 3500);
    }

    /** wire page DOM: new-button, dialog form submit, search, sort, initial list */
    async mount() {
      const dialog = document.querySelector("[data-crud-dialog]");
      const form = dialog.querySelector("form");
      for (const field of this.cfg.fields) {
        if (field.dynamic) continue; // page supplies its own [data-dynamic] select
        const label = document.createElement("label");
        label.textContent = t(field.label);
        const input = document.createElement("input");
        input.name = field.path.replace(/\./g, "__");
        input.type = inputType({ type: field.type, format: field.format });
        if (field.required) input.required = true;
        label.append(input);
        form.append(label);
      }
      const submitBtn = document.createElement("button");
      submitBtn.type = "submit";
      submitBtn.textContent = t("common.save");
      form.append(submitBtn);
      form.addEventListener("submit", (e) => this.submit(e));
      document.querySelector("[data-crud-new]").addEventListener("click", () => this.openForm(null));

      if (this.cfg.searchable) {
        const search = document.querySelector("[data-crud-search]");
        if (search) search.addEventListener("input", () => {
          this._search = search.value.trim();
          this.renderList();
        });
      }
      const sortRoot = document.querySelector("[data-crud-sort]");
      if (sortRoot) {
        for (const head of sortRoot.querySelectorAll("[data-sort]")) {
          head.addEventListener("click", () => this.sortBy(head.dataset.sort));
        }
      }
      await this.refresh();
    }
  }

  window.LeafGuru.CrudPage = CrudPage;
})();
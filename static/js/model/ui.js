/**
 * LeafGuru — shared UI helpers (flash messages, validation formatting).
 *
 * Pages keep their own toolbar flash ([data-crud-flash]) for list-level
 * feedback; forms inside <dialog> get their own error element
 * ([data-crud-error]) so failures are visible ABOVE the modal backdrop.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const t = (k, p) => window.LeafGuru.i18n.t(k, p);

  /** format a LeafGuruValidationError into a readable message */
  function formatErrors(e) {
    const errors = e.name === "LeafGuruValidationError" ? e.errors : [];
    return `${t("messages.validationFailed")}: ` +
      errors.slice(0, 3).map((x) =>
        `${x.path.replace(/^\$\.?/, "").replace(/\[(\d+)\]/g, "[$1]") || "record"} ${x.message}`
      ).join("; ") +
      (errors.length > 3 ? ` (+${errors.length - 3})` : "");
  }

  /**
   * flash a message inside the dialog the form lives in — plus the page's
   * toolbar flash. Error styling via [data-crud-error--is-error].
   */
  function dialogFlash(form, message, isError = false) {
    const dialog = form?.closest?.("dialog");
    let errEl = dialog?.querySelector("[data-crud-error]");
    if (errEl) {
      errEl.textContent = message;
      errEl.classList.toggle("crud-error", isError);
      errEl.hidden = false;
      clearTimeout(errEl._timer);
      errEl._timer = setTimeout(() => { errEl.hidden = true; }, 6000);
    }
    // toolbar flash as fallback (behind the backdrop, but consistent)
    const toolbar = document.querySelector("[data-crud-flash]");
    if (toolbar) {
      toolbar.textContent = message;
      toolbar.hidden = false;
      toolbar.style.color = isError ? "var(--danger)" : "";
      clearTimeout(toolbar._timer);
      toolbar._timer = setTimeout(() => { toolbar.hidden = true; }, 6000);
    }
  }

  /** standard submit error handler: LeafGuruValidationError → readable text */
  function reportSubmitError(form, e) {
    dialogFlash(form, e.name === "LeafGuruValidationError" ? formatErrors(e) : e.message, true);
  }

  /**
   * Close every <dialog> on click outside its content box (the backdrop
   * area). Wire per dialog once — replaces per-dialog Cancel buttons.
   */
  function wireBackdropClose() {
    for (const dialog of document.querySelectorAll("dialog")) {
      if (dialog._backdropWired) continue;
      dialog._backdropWired = true;
      dialog.addEventListener("click", (event) => {
        // clicks land on the dialog element itself only when the backdrop
        // (the dialog's padding box outside its content) was hit
        if (event.target === dialog) dialog.close();
      });
    }
  }

  window.LeafGuru.ui = { formatErrors, dialogFlash, reportSubmitError, wireBackdropClose };
})();
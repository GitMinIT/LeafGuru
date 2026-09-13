/**
 * LeafGuru — task domain logic (pure functions, tested in
 * tests/task-domain.test.js). Complements plant-domain; no DOM access.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const STATUSES = ["open", "done", "skipped"];

  window.LeafGuru.taskDomain = {
    statuses: STATUSES,

    /** today as YYYY-MM-DD (local time) */
    today(now = null) {
      const d = now ? new Date(now) : new Date();
      const off = d.getTimezoneOffset() * 60000;
      return new Date(d - off).toISOString().slice(0, 10);
    },

    /** status transition: open→done/skipped stamps completedAt; back to open clears it */
    applyStatusChange({ task, newStatus, at = null }) {
      if (!STATUSES.includes(newStatus)) throw new Error(`unknown task status: ${newStatus}`);
      const now = at ?? new Date().toISOString();
      const next = { ...task, status: newStatus, updatedAt: now };
      if (newStatus === "open") {
        next.completedAt = null;
      } else if (task.status !== newStatus) {
        next.completedAt = now;
      }
      return next;
    },

    /** is the task open and past its due date? */
    isOverdue(task, today = null) {
      if (task.status !== "open" || !task.dueDate) return false;
      const ref = today ?? this.today();
      return task.dueDate < ref;
    },

    /** due today and still open? */
    isDueToday(task, today = null) {
      if (task.status !== "open" || !task.dueDate) return false;
      const ref = today ?? this.today();
      return task.dueDate === ref;
    },

    /** tasks for the dashboard: open, sorted by dueDate, overdue first */
    dueList(tasks, { today = null } = {}) {
      const ref = today ?? this.today();
      return tasks
        .filter((t) => t.status === "open")
        .sort((a, b) => {
          const ao = this.isOverdue(a, ref) ? 0 : 1;
          const bo = this.isOverdue(b, ref) ? 0 : 1;
          if (ao !== bo) return ao - bo;
          return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
        });
    }
  };
})();
/**
 * LeafGuru — nav behaviour.
 *
 * The nav has grown to 14 items and no longer fits on one line, so it
 * scrolls horizontally. Two small things that make that bearable:
 *
 *  1. the ACTIVE item is scrolled into view, so you always know where
 *     you are without scrolling to look
 *  2. the mouse wheel scrolls the nav horizontally too — a horizontal
 *     scrollbar on a trackpad-less desktop is a nuisance
 *
 * The active item is the one whose data-nav matches the page key on
 * <body> (the same rule the CSS uses for the highlight).
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  /** the nav link for the current page, or null */
  function activeLink() {
    const page = document.querySelector("body")?.dataset.page ?? "";
    return document.querySelector(`.nav a[data-nav="${page}"]`) ?? null;
  }

  /** scroll the active item into view (without yanking the page) */
  function revealActive() {
    const nav = document.querySelector(".nav");
    const link = activeLink();
    if (!nav || !link) return;

    // where is the link, relative to the nav's scroll box?
    const linkLeft = link.offsetLeft;
    const linkRight = linkLeft + link.offsetWidth;
    const viewLeft = nav.scrollLeft;
    const viewRight = viewLeft + nav.clientWidth;

    if (linkLeft < viewLeft) {
      nav.scrollTo({ left: Math.max(0, linkLeft - 12), behavior: "auto" });
    } else if (linkRight > viewRight) {
      nav.scrollTo({
        left: Math.min(nav.scrollWidth, linkRight - nav.clientWidth + 12),
        behavior: "auto"
      });
    }
  }

  /**
   * Let a vertical wheel scroll the nav sideways. A horizontal
   * scrollbar is awkward to drag, and most people do not know they
   * can shift+scroll.
   */
  function wireWheel() {
    const nav = document.querySelector(".nav");
    if (!nav || nav._wheelWired) return;
    nav._wheelWired = true;
    nav.addEventListener("wheel", (event) => {
      // only when the nav actually overflows, and only for a mostly
      // vertical gesture (otherwise the sideways scroll feels broken)
      if (nav.scrollWidth <= nav.clientWidth + 1) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      nav.scrollLeft += event.deltaY;
    }, { passive: false });
  }

  window.LeafGuru.nav = { activeLink, revealActive, wireWheel };

  document.addEventListener("DOMContentLoaded", () => {
    wireWheel();
    revealActive();
  });
})();

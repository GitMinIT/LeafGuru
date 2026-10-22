/**
 * LeafGuru — the welcome (first run).
 *
 * A dialog that appears once, on a genuinely empty app, and walks a
 * beginner through the four things that matter. It is not a tutorial
 * that blocks you: it can be dismissed, and "look around first" loads
 * the demo into its own profile so nothing real is touched.
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  let currentStep = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * Render the welcome dialog, showing one step at a time.
   * The steps are the same four the onboarding module defines.
   */
  function renderStep() {
    const t = (k, p) => window.LeafGuru.i18n.t(k, p);
    const steps = window.LeafGuru.onboarding.STEPS;
    const step = steps[currentStep];

    const body = document.querySelector("[data-welcome-body]");
    body.replaceChildren();

    const icon = el("div", "welcome__icon", step.icon);
    icon.setAttribute("aria-hidden", "true");

    const title = el("h3", "welcome__title", t(step.titleKey));
    const text = el("p", "welcome__text", t(step.textKey));

    body.append(icon, title, text);

    // the step counter: "step 2 of 4" — so the user knows it ends
    const counter = document.querySelector("[data-welcome-counter]");
    counter.textContent = `${currentStep + 1} / ${steps.length}`;

    // the dots
    const dots = document.querySelector("[data-welcome-dots]");
    dots.replaceChildren();
    for (const [i, s] of steps.entries()) {
      const dot = el("span", `welcome__dot${i === currentStep ? " welcome__dot--now" : ""}`);
      dot.title = t(s.titleKey);
      dots.append(dot);
    }

    // the buttons
    const back = document.querySelector("[data-welcome-back]");
    back.hidden = currentStep === 0;
    const next = document.querySelector("[data-welcome-next]");
    next.textContent = currentStep === steps.length - 1 ? t("welcome.finish") : t("welcome.next");
  }

  /** open the welcome dialog */
  function open() {
    currentStep = 0;
    renderStep();
    const dlg = document.querySelector("[data-welcome-dialog]");
    if (dlg && !dlg.open) dlg.showModal();
  }

  function close({ remember = true } = {}) {
    if (remember) window.LeafGuru.onboarding.rememberWelcome();
    const dlg = document.querySelector("[data-welcome-dialog]");
    if (dlg?.open) dlg.close();
  }

  function next() {
    const steps = window.LeafGuru.onboarding.STEPS;
    if (currentStep >= steps.length - 1) {
      close();
      return;
    }
    currentStep += 1;
    renderStep();
  }

  function back() {
    if (currentStep > 0) {
      currentStep -= 1;
      renderStep();
    }
  }

  /** wire the dialog's buttons (once) */
  function wire() {
    const dlg = document.querySelector("[data-welcome-dialog]");
    if (!dlg || dlg._wired) return;
    dlg._wired = true;

    document.querySelector("[data-welcome-next]")?.addEventListener("click", next);
    document.querySelector("[data-welcome-back]")?.addEventListener("click", back);

    // "skip" — the user closes the welcome and does not see it again
    document.querySelector("[data-welcome-skip]")?.addEventListener("click", () => close());

    // the "look around first" button: the demo, in its own profile
    document.querySelector("[data-welcome-demo]")?.addEventListener("click", async () => {
      const status = document.querySelector("[data-welcome-status]");
      try {
        status.textContent = window.LeafGuru.i18n.t("data.demoGrowLoaded");
        await window.LeafGuru.demoData.seedDemoProfile({ switchTo: true });
        // the demo lives in another profile -> a reload lands in it
        location.reload();
      } catch (e) {
        status.textContent = e.message;
      }
    });
  }

  window.LeafGuru.welcome = { open, close, next, back, wire };
})();

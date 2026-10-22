/**
 * LeafGuru — onboarding.
 *
 * The first run is the moment the app can lose a beginner. So the
 * empty app is not an error state with a grey message: it is a
 * welcome with four small steps, and a way to look around first
 * without committing to anything.
 *
 * The rules:
 *  * the welcome only appears when the app is genuinely empty — a
 *    user with data should never be greeted again
 *  * every step is a link to the thing it describes, so the app
 *    teaches itself
 *  * "look around first" loads the demo into its OWN profile, so it
 *    can never touch real data
 *  * a user who dismisses the welcome is not asked again (the
 *    choice is remembered)
 */
(function () {
  "use strict";

  window.LeafGuru = window.LeafGuru || {};

  const KEY = "leafguru.welcomed";

  /** has the user already been welcomed (or dismissed the welcome)? */
  function hasSeenWelcome() {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  }

  function rememberWelcome() {
    try {
      localStorage.setItem(KEY, "1");
    } catch { /* private mode: the welcome shows again, which is fine */ }
  }

  /**
   * Is the app empty? A first-run app has no plants, no grows and no
   * locations — that is the state where the welcome belongs.
   */
  function isFirstRun({ plants = [], grows = [], locations = [] } = {}) {
    return plants.length === 0 && grows.length === 0 && locations.length === 0;
  }

  /**
   * The four steps, in the order they actually happen. Each one
   * points at a real place in the app.
   */
  const STEPS = [
    {
      id: "place",
      icon: "🏠",
      titleKey: "welcome.step1Title",
      textKey: "welcome.step1Text",
      href: "/locations/",
      ctaKey: "welcome.begin"
    },
    {
      id: "plant",
      icon: "🌱",
      titleKey: "welcome.step2Title",
      textKey: "welcome.step2Text",
      href: "/plants/",
      ctaKey: "welcome.begin"
    },
    {
      id: "journal",
      icon: "📖",
      titleKey: "welcome.step3Title",
      textKey: "welcome.step3Text",
      href: "/today/",
      ctaKey: "welcome.begin"
    },
    {
      id: "sensors",
      icon: "🌡️",
      titleKey: "welcome.step4Title",
      textKey: "welcome.step4Text",
      href: "/sensors/",
      ctaKey: "welcome.begin"
    }
  ];

  window.LeafGuru.onboarding = {
    STEPS,
    hasSeenWelcome,
    rememberWelcome,
    isFirstRun
  };
})();

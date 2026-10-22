/**
 * A syntax guard for every shipped JavaScript file.
 *
 * The unit tests load the modules they need, so a file with a syntax
 * error that no test touches is invisible to them. And a syntax error
 * in a PAGE script is invisible to the unit tests entirely — the page
 * script is only ever run in a browser.
 *
 * That is exactly how sensors.js shipped with a Python-style triple
 * quote as its header: the browser threw "Invalid or unexpected
 * token", the page rendered with no cards and a dead button, and
 * every unit test still passed. The real-browser check caught it,
 * but only after a rebuild.
 *
 * This test parses every .js file the app ships and fails on the
 * first one that does not parse. It is cheap (a syntax check, no
 * execution) and it runs in the normal suite.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

/** every .js file the app ships to the browser */
function shippedFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "data") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) shippedFiles(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

test("every shipped JavaScript file parses", () => {
  const files = shippedFiles(path.join(ROOT, "static", "js"));
  assert.ok(files.length > 20, `expected the app to ship many files, got ${files.length}`);
  const broken = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    try {
      // parsing without running: a Script compiles, it does not execute
      new vm.Script(source, { filename: file });
    } catch (e) {
      broken.push(`${path.relative(ROOT, file)}: ${e.message}`);
    }
  }
  assert.deepEqual(broken, [], `these files do not parse:\n${broken.join("\n")}`);
});

test("every shipped JavaScript file starts with a sane header", () => {
  // a Python-style """ header is the mistake that actually happened
  const files = shippedFiles(path.join(ROOT, "static", "js"));
  const bad = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8").trimStart();
    if (source.startsWith('"""') || source.startsWith("'''")) {
      bad.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(bad, [], `these files start with a Python-style quote: ${bad.join(", ")}`);
});

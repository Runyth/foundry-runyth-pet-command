import assert from "node:assert/strict";
import test from "node:test";

/**
 * Verify that the exact manifest entrypoint and its complete static import graph
 * can be evaluated as native ES modules before Foundry invokes lifecycle hooks.
 */
test("manifest entrypoint imports without an ES-module load failure", async () => {
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: class ApplicationV2 {},
        DialogV2: class DialogV2 {},
      },
    },
  };
  globalThis.Hooks = {
    once() {},
    on() {},
    callAll() {},
  };

  const runtime = await import(`../scripts/main.mjs?entrypoint-test=${Date.now()}`);
  assert.equal(typeof runtime, "object");
});

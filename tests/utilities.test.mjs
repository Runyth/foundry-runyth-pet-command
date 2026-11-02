import assert from "node:assert/strict";
import test from "node:test";

import { downloadJson, isUserInputError, readJsonFile, UserInputError } from "../scripts/utilities.mjs";

test("downloadJson uses the Foundry v13 namespaced file utility", () => {
  const originalFoundry = globalThis.foundry;
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "saveDataToFile");
  let saved = null;
  Object.defineProperty(globalThis, "saveDataToFile", {
    configurable: true,
    get() {
      throw new Error("Deprecated global saveDataToFile was accessed");
    },
  });
  globalThis.foundry = {
    utils: {
      saveDataToFile(data, type, filename) {
        saved = { data, type, filename };
      },
    },
  };

  try {
    downloadJson("relationships.json", { relationship: 1 });
    assert.deepEqual(saved, {
      data: JSON.stringify({ relationship: 1 }, null, 2),
      type: "application/json",
      filename: "relationships.json",
    });
  } finally {
    globalThis.foundry = originalFoundry;
    if (originalDescriptor) Object.defineProperty(globalThis, "saveDataToFile", originalDescriptor);
    else delete globalThis.saveDataToFile;
  }
});

test("readJsonFile accepts file-like values without relying on a realm-specific File constructor", async () => {
  const parsed = await readJsonFile({ text: async () => '{"valid":true}' });
  assert.deepEqual(parsed, { valid: true });
});

test("readJsonFile reports missing and malformed files as expected user input", async () => {
  await assert.rejects(() => readJsonFile(null), (error) => isUserInputError(error) && error.fieldName === "importFile");
  await assert.rejects(
    () => readJsonFile({ text: async () => "not json" }),
    (error) => error instanceof UserInputError && error.fieldName === "importFile" && error.cause instanceof SyntaxError,
  );
});

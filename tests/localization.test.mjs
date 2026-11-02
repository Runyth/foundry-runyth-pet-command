// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, t } from "../scripts/utilities.mjs";

test("localization helper uses Foundry's active language dictionary", () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    i18n: {
      format: (key, data) => (key === "PETCOMMAND.Test.Greeting" ? `Hallo ${data.name}` : key),
      localize: (key) => key,
    },
  };

  try {
    assert.equal(t("PETCOMMAND.Test.Greeting", { name: "Tester" }, "Hello Tester"), "Hallo Tester");
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
});

test("localization helper provides an English fallback for a missing translation", () => {
  const previousGame = globalThis.game;
  globalThis.game = {
    i18n: {
      format: (key) => key,
      localize: (key) => key,
    },
  };

  try {
    assert.equal(t("PETCOMMAND.Fallback.UnnamedPet", {}, "Unnamed pet"), "Unnamed pet");
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
});


test("HTML escaping is allocation-light and complete", () => {
  assert.equal(escapeHtml(`<tag a="b">Tom & Jerry's</tag>`), "&lt;tag a=&quot;b&quot;&gt;Tom &amp; Jerry&#39;s&lt;/tag&gt;");
});

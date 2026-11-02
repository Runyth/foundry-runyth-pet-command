# Localization

Pet Command uses Foundry VTT's standard package-localization mechanism. No custom language switch, dashboard control, or world setting is used.

## User language selection

Each user selects a language through Foundry:

```text
Configure Settings → Core Settings → Language Preference
```

Pet Command automatically uses `game.i18n` and therefore follows the selected Foundry language. English is the complete default. German is included as a complete translation.

## File structure

```text
pet-command/
├── module.json
└── lang/
    ├── en.json
    └── de.json
```

The manifest declares each translation:

```json
{
  "languages": [
    {
      "lang": "en",
      "name": "English",
      "path": "lang/en.json"
    },
    {
      "lang": "de",
      "name": "Deutsch",
      "path": "lang/de.json"
    }
  ]
}
```

## Adding another language

1. Copy `lang/en.json` to `lang/<language-code>.json`.
2. Translate values only. Do not rename, remove, or restructure keys.
3. Add a matching entry to `module.json` under `languages`.
4. Run `npm test` and `npm run validate`.
5. Select the new language in Foundry's **Language Preference** and execute the localization section of the manual test plan.

Use a lower-case language code accepted by Foundry. Translation keys are namespaced under `PETCOMMAND` to avoid collisions with Foundry, game systems, and other modules.

## Completeness rule

Every language file distributed by Pet Command must contain the same key set as `lang/en.json`. English remains authoritative for meaning and variable placeholders such as `{count}`, `{dc}`, and `{target}`. Translators must preserve every placeholder exactly.

Application titles, buttons, labels, help text, validation errors, notifications, chat summaries, command descriptions, target guidance, and fallback document names all resolve through localization keys. A small explicit English fallback is retained only for damaged or incomplete external translations, preventing raw keys from reaching the interface.

## References

- https://foundryvtt.com/article/localization/
- https://foundryvtt.com/article/settings/
- https://foundryvtt.com/article/module-development/

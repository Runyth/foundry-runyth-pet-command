# Changelog

## 1.3.1 - 2026-11-03

### Fixed and improved

- AGENTS.md conformance release: the manifest author carries the standard organisational URL, and the shipped house-rule content states its CC BY-SA 4.0 content licence in the README. No runtime behaviour relationship or dependency change.

## 1.3.0 — 2026-08-08

- First publication as a Runyth module: `runyth-pet-command` / **Runyth Pet Command** with the publication standard in place — deterministic `-mod`, `-src`, and `-doc` archives with per-version checksums, byte-identical rebuild verification, standard quality and release pipelines, the full GNU AGPL-3.0-or-later licence with the standard source notice, the standard README licence chapter, and the manifest URL surfaces.

- Enabled the **Party members** random-behaviour target pool by default for newly created pet profiles while preserving explicit choices already stored on existing profiles.
- Added a relationship-scoped GM permission allowing a selected owner Actor to see and choose random-behaviour target pools in the lightweight player command panel.
- Added the same target-pool controls automatically to privileged Owner Perspective, so a GM or Assistant GM acting as a selected owner can choose them directly.
- Kept delegated player target-pool choices transient per relationship and per open panel; they do not modify the pet profile's GM-owned defaults.
- Added GM-side socket validation so unpermitted player clients cannot submit custom random-behaviour target pools by crafting socket payloads.
- Added a relationship-table checkbox for enabling or disabling player visibility of the random-behaviour target controls.
- Added automatic token movement for successful movement-capable commands, reusing the existing command roll and persistence workflow.
- Successful **Come**, **Heel**, and **Retreat** commands now move the pet toward the owner.
- Successful **Fetch**, **Guard**, **Track**, **Distract**, **Attack**, and **Move** commands now move toward their effective target; **Guard** falls back to its owner when no explicit target is chosen.
- Successful **Search** commands perform a short local movement; **Stay**, **Quiet**, and **Release** remain stationary.
- Successful **Attack** commands now complete command movement before invoking the configured D&D 5e default attack activity.
- Reworked command and random-reaction movement around Foundry v13's `TokenDocument.move` and `Token.findMovementPath` APIs.
- Added token-size-aware approach calculations so pets stop adjacent to targets instead of overlapping them.
- Fixed approach movement overshooting when the pet is already adjacent to its owner or target.
- Added Foundry pathfinding before movement where available, with wall and movement-cost constraints enabled.
- Added movement-animation awaiting so follow-up attack workflows do not race ahead of the visible token move.
- Added partial-movement detection: when Foundry constrains a route but still moves the token, Runyth Pet Command records the movement as partial rather than rejected.
- Preserved direct Foundry document-update fallback only for environments where `TokenDocument.move` is unavailable.
- Existing random reactions use the same hardened movement engine, including targeted aggressive actions such as **Snap at target** and **Chase target**.
- Preserved the combat-safety boundary: random **Snap at target** is movement/behaviour only and does not silently roll an attack or apply damage; only a successful explicit **Attack** command invokes the configured D&D 5e attack workflow.
- Migrated stored relationship data to schema version 3 by adding `playerBehaviourTargetsEnabled`, defaulting safely to `false` for existing relationships.
- Preserved existing pet profiles, target-pool choices, relationship XP, obedience overrides, histories, termination state, backups, imports/exports, Owner Perspective, player commands, and attack configuration.
- Added movement, delegation, migration, static-architecture, and full command-sequence regression coverage.

## 1.2.0 — 2026-08-08

- Added a dedicated **Owner Perspective** for Game Masters and Assistant Game Masters that reuses the lightweight player command workflow without changing Actor ownership or user permissions.
- Added **Open Runyth Pet Commands as Selected Actor** to Token Scene Controls. Exactly one controlled token establishes the acting owner.
- Added **Issue Runyth Pet Commands as this Actor** to Actor Directory context actions.
- Added an owner-perspective Token HUD control for Actors that currently own at least one active pet relationship.
- Added an **Open owner perspective** shortcut to every active owner relationship in the GM relationship table.
- Added fast switching among Actors that currently own active pet relationships inside Owner Perspective.
- Filtered Owner Perspective to active relationships belonging specifically to the selected owner Actor; unrelated pets never appear in that perspective.
- Added a read-only relationship summary with XP, effective obedience, bond level, command count, and success/failure record to the player-style panel.
- Added an **Open full manager** shortcut from Owner Perspective for privileged relationship editing without duplicating GM controls into the player-style surface.
- Resolved privileged commands directly on the local GM/Assistant GM client while retaining the existing socket-authorized workflow for ordinary players.
- Added optional owner-attributed chat speaker data for privileged perspective rolls while preserving the pet Actor's normal D&D 5e attack workflow.
- Preserved existing GM Manager behavior, player permissions, player command setting, relationship storage, XP progression, random behaviour, movement, exports, and default-attack integration.
- Added public API capability `privileged-owner-perspective` and `openOwnerPerspective({ actorId, tokenDocument })`.
- Added automated owner filtering, ordinary-player denial, Assistant-GM-compatible command execution, and additive-entrypoint regression tests.
- Relationship schema remains version 2; no data migration is required.

## 1.1.5 — 2026-08-04

- Fixed the reported failure to load `modules/runyth-pet-command/scripts/main.js`, which prevented Runyth Pet Command from starting.
- Migrated the complete browser runtime graph from ambiguous `.js` module filenames to explicit `.mjs` ES-module filenames.
- Changed the Foundry manifest entrypoint to the exact path `scripts/main.mjs`.
- Updated every static runtime import to an explicit relative `.mjs` path with matching filename case.
- Removed all runtime `.js` files from the installation archive so stale or mixed-version files cannot remain part of the active graph.
- Added an automated entrypoint-evaluation test that loads the exact manifest module and its complete dependency graph before Foundry lifecycle callbacks execute.
- Added recursive source validation proving that every runtime module is reachable from the manifest entrypoint, exists on disk, uses `.mjs`, and stays within the module root.
- Added installation-archive validation proving that the exact manifest entrypoint and every recursive import exist inside the final ZIP.
- Added checks rejecting unreachable runtime files, missing imports, `.js` regressions, path traversal, incorrect archive roots, and source/install byte mismatches.
- Updated installation and troubleshooting guidance to require replacing the complete previous module directory and hard-refreshing connected clients.
- Preserved relationship schema version 2 and all existing settings, relationships, XP, histories, pet profiles, backups, exports, player commands, movement, and attack integration.

## 1.1.4 — 2026-08-04

- Replaced the deprecated global `saveDataToFile` export API with Foundry v13's namespaced `foundry.utils.saveDataToFile` utility.
- Retained a standards-based browser download fallback for non-Foundry test and development environments.
- Delayed fallback object-URL revocation until after the browser receives the download click.
- Added a dedicated `UserInputError` boundary so expected form-validation failures do not appear as module defects in the console.
- Changed missing owner, missing pet, missing selected token, invalid XP, missing import file, malformed JSON, and invalid import-envelope feedback to focused warning notifications.
- Disabled relationship creation until at least one owner is selected.
- Disabled JSON import until a file is selected.
- Added `aria-invalid` feedback and focus restoration for the field that needs correction.
- Replaced realm-sensitive `instanceof File` import validation with a file-like interface check, improving browser and test-environment compatibility.
- Added complete English and German localization for malformed JSON.
- Added regression tests and static validation for namespaced exports, cross-realm file handling, expected user-input errors, and guarded form actions.
- Reviewed the supplied live Foundry log and confirmed that the remaining deprecations and package failures are not emitted by Runyth Pet Command.

## 1.1.3 — 2026-08-04

- Fixed all Runyth Pet Command Manager tab buttons failing with `You must pass both the tab and tab group identifier` under Foundry VTT v13.
- Replaced Foundry's reserved `data-action="tab"` value with the validated module-owned `switch-tab` action.
- Added an explicit manager-tab allowlist so malformed or third-party-injected tab identifiers are ignored.
- Preserved conditional tab rendering and the v1.1.2 cached-state architecture without introducing extra settings writes or background work.
- Added WAI-ARIA tablist, tab, tabpanel, selected-state, control relationship, and roving `tabindex` semantics.
- Added Arrow key, Home, and End keyboard navigation with focus restoration after rendering.
- Added visible keyboard focus styling.
- Added regression tests preventing the reserved tab action or ungrouped `ApplicationV2.changeTab` calls from returning.
- Expanded static validation, troubleshooting guidance, manual runtime tests, code audit, patch report, and incremental best-practice changelog.
- Added deterministic three-archive release packaging: source, installation-only, and documentation/evidence bundles.

## 1.1.2 — 2026-08-03

- Cached canonical world state, configuration, and backup data instead of cloning and normalizing them on every read.
- Removed the second full-state clone from normalization while preserving immutable public API snapshots.
- Memoized weighted d20 allocations with mutation-aware signatures.
- Combined obedience XP, failure behaviour, and successful default-attack history into one world-setting transaction per command sequence.
- Coalesced state/configuration-driven ApplicationV2 refreshes to one animation-frame render per open window.
- Removed redundant full rerenders after settings mutations and stopped forcing renders for already-open applications.
- Cached sorted Actor lists and invalidated them only when Actor documents change.
- Reduced scene-token scans by resolving pet and owner tokens in one pass and using direct Canvas token lookup where possible.
- Reduced attack execution work by resolving the configured activity without building and sorting the complete UI choice list.
- Changed random-target collection from repeated scene scans to one scene-token classification pass.
- Isolated API consumers from cached internal data through explicit snapshots.
- Added safe chat-post failure handling so a chat rendering problem cannot invalidate a completed command transaction.
- Cached sorted relationship and pet-profile views against canonical state revisions and active language.
- Replaced quadratic multi-owner duplicate detection with one indexed relationship pass.
- Added narrow relationship/profile API snapshots so callers no longer clone unrelated history and world data.
- Removed repeated bond-level array allocation and used direct action lookup for the standard action catalog.
- Added performance regression tests, a reproducible microbenchmark, and a full performance audit document.

## 1.1.1 — 2026-08-03

- Confirmed and retained Foundry v13's native manifest-based localization architecture.
- Kept English as the complete default language and German as a complete optional translation.
- Localized ApplicationV2 window titles, fallback Actor labels, import validation, backup errors, and GM-only storage errors.
- Added explicit English fallbacks for damaged or incomplete third-party translation files.
- Added localization contributor documentation for extending the module with further languages.
- Documented that language selection belongs in Foundry's Core Settings rather than the Runyth Pet Command dashboard or module-specific settings.
- Added localization regression tests and stronger validation against untranslated application titles and errors.
- Added a deterministic builder for separate installable and complete source archives.

## 1.1.0 — 2026-07-24

- Made command difficulty explicit with Very easy through Very hard labels.
- Added a full DC breakdown separating relationship base DC, base command modifier, and attitude modifier.
- Added attitude-specific command modifiers.
- Made aggressive pets easier to command to attack and harder to command to heel, quiet down, or retreat.
- Added explicit per-command target explanations and disabled meaningless target selectors.
- Separated command targets from random-failure behaviour targets.
- Added a lightweight player command panel showing only relationships whose owner Actor the player controls.
- Added designated-GM socket validation and GM-authoritative XP/history updates for player requests.
- Added configurable successful Attack automation through the standard D&D 5e attack-roll workflow.
- Added per-pet default attack selection with automatic first-usable-attack fallback.
- Preserved the safety boundary that random biting behaviour does not automatically roll attacks or damage.
- Added new configuration toggles, localization, documentation, and regression tests.
- Migrated exports and stored state to schema version 2 while preserving version 1 data.

## 1.0.0 — 2026-07-24

- Added pet profiles with five attitude presets and twenty weighted behaviour types.
- Added independent per-owner relationship records for pets with one or several owners.
- Added configurable learning, command checks, random behaviour, movement, lifecycle management, JSON transfer, backups, localization, API, tests, and documentation.

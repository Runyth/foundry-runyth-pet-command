# Runyth Pet Command v1.3.0 Code Audit

## Scope

Reviewed runtime modules, state normalization, socket authorization, ApplicationV2 rendering, command sequence persistence, token movement, D&D 5e attack sequencing, localization, tests, and release tooling.

## Findings and changes

1. **Successful commands lacked movement.** Added movement metadata to commands and integrated `movePetForCommand` into the success path.
2. **Approach geometry could overshoot adjacency.** Replaced center-distance-only movement with token-size-aware projected extents and an adjacency gap.
3. **Movement did not attempt a routed path.** Added optional `Token.findMovementPath` before `TokenDocument.move` with walls/cost constraints active.
4. **Constrained movement could be misreported.** The executor now compares pre/post coordinates and reports partial movement when Foundry moved the token despite returning an incomplete result.
5. **Attack could race visible movement.** The movement animation promise is awaited before the D&D 5e attack workflow begins.
6. **Players could not be selectively shown behavior target choices.** Added a relationship-scoped permission and transient panel state.
7. **Delegated options required server-side trust boundaries.** GM socket handling now discards custom pools unless the relationship explicitly permits them and normalizes accepted values.
8. **Party target default was off.** New profiles now initialize the party pool enabled.

No polling, blocking loops, synchronous filesystem/browser I/O, MutationObservers, deprecated ApplicationV1 code, or duplicate state transactions were introduced.

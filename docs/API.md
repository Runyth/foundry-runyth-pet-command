# Runyth Pet Command v1.3.0 Public API

Access the API through:

```text
game.modules.get("runyth-pet-command")?.api
```

API version: `1.3.0`.

## Capabilities relevant to v1.3.0

- `privileged-owner-perspective`
- `delegated-behaviour-targets`
- `token-movement`
- `command-movement`

The previous API methods remain available. `openOwnerPerspective({ actorId, tokenDocument })` continues to open the privileged player-style surface for GM/Assistant GM clients.

Command sequence results now expose `commandMovement` in addition to obedience, optional random behavior, and optional default-attack results. Serialized player-command results include the same movement summary.

The module does not expose a player API for directly changing `playerBehaviourTargetsEnabled`; that permission remains GM-owned relationship administration.

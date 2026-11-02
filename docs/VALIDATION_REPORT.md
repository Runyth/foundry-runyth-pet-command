# Validation Report

Release: `1.3.0`  
State schema: `3`

Automated validation covers:

- manifest/package/runtime version parity;
- Foundry v13 compatibility bounds;
- complete English/German localization key and placeholder parity;
- recursive `.mjs` entrypoint graph and syntax;
- ApplicationV2 navigation safety;
- canonical state/performance architecture;
- relationship-scoped delegated behavior-target controls;
- default party target pool for new profiles;
- successful command movement integration;
- Foundry pathfinding and TokenDocument movement usage;
- partial movement detection;
- single state mutation per command sequence;
- namespaced v13 file export API;
- deterministic source/install/documentation packaging.

Automated test suite: **51 passed, 0 failed**. Clean-extracted source tests/validation and installation-entrypoint evaluation also passed.

See `reports/TEST_RESULTS.txt`, `reports/VALIDATION_RESULTS.txt`, `reports/BENCHMARK_RESULTS.txt`, and `reports/ARCHIVE_VALIDATION.txt` for captured release evidence.

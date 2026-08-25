# EagleNEST Deployment Safety Gate

This directory contains the small, high-priority safety suite that must pass before a production Worker deploy.

The safety gate is intentionally separate from the normal feature regression tests. It protects system-wide invariants that should not change accidentally during modularization or feature work.

Safety is split across focused `*.test.js` files rather than one ever-growing file. `deployment-safety.test.js` protects the global Worker invariants. Extracted subsystems may add their own focused safety contract here when they introduce additional deployment-critical rules. `npm run test:safety` runs every `student-scanner/safety/*.test.js` file.

## What it protects

- `wrangler.jsonc` continues to deploy `src/index.js`.
- Extracted routes execute before the legacy `worker.js` fallback.
- Unmigrated routes and scheduled work still retain the known-good legacy fallback.
- Extracted modules do not directly import the legacy monolith.
- Critical admin endpoint paths do not silently move or disappear.
- `x-admin-session`, cookie fallback, and internal admin-token authentication remain compatible.
- View-as-Teacher uses the selected teacher as the effective identity and remains read-only.
- Practice Mode fails closed when mode state cannot be read.
- Attendance Diagnostics cannot mix live traces into Practice results.
- Force-live helper usage stays restricted to approved Visitor, control-plane, and explicitly live-only delivery contexts.
- Operational external side effects remain suppressed in Practice Mode.
- Authoritative non-Visitor Apps Script writers retain their fail-closed Practice guards.
- Subsystem-specific safety files protect extracted endpoint ownership and storage contracts; for example, Access Management protects the role/allowlist KV keys consumed by the shared session capability evaluator.

## Commands

From the repository root:

```bash
npm run test:safety
npm run verify
```

From `cf-redcake/red-cake-77d5`:

```bash
npm run test:safety
npm run verify
npm run deploy
```

`npm run verify` runs in this order:

1. Worker/module syntax checks.
2. All deployment safety tests in `student-scanner/safety/*.test.js`.
3. Full Student Scanner regression suite.

The Cloudflare package also defines `predeploy: npm run verify`, so the normal `npm run deploy` command automatically runs the full verification sequence before Wrangler is allowed to deploy.

## Deployment rule

If `npm run test:safety` fails, do not deploy merely by weakening or deleting the assertion. First determine whether the change is an accidental regression or an intentional architecture change.

If an invariant truly needs to change, update the implementation and its safety contract together, with the new behavior explicitly reviewed. The safety suite is a deployment policy, not just test coverage.

When a newly extracted subsystem has deployment-critical invariants, prefer adding a focused `<subsystem>-safety.test.js` file rather than expanding unrelated safety tests. Keep each safety contract small enough that a failure clearly identifies the system at risk.

The legacy Worker should remain available as a fallback while an extracted subsystem is first proven in production. Deleting dormant legacy code should be a later, separate change.

---
name: enforce-antifraud-release-discipline
description: Enforce cumulative local-first release closure across Antifraud shared packages, services and portals. Use for every behavior, flow, package, image, deployment, merge or publication change.
---

# Enforce Antifraud Release Discipline

These are hard release gates, not recommendations.

## Functional closure before release

- A shared-package unit suite is necessary but never sufficient to publish a
  feature. The affected capability must first work through the real local
  application path: UI to BFF to high-level SDK to Gateway or owning service,
  with authoritative persistence and readback.
- Treat deployment surface and application profile as independent axes.
  `test` is automated, local Demo is the real local UI/BFF/SDK/Gateway flow,
  `local-network` is real local Fabric, deployed Demo may run on Beta/staging
  or public hosting with the virtual in-memory ledger, `test-network` is real
  cloud Fabric, and `network` is Production. Public hosting never promotes a
  Demo request into Test Network or Production.
- Run release gates strictly in this order: `test -> local Demo ->
  local-network -> cumulative release -> deployed Demo/staging ->
  test-network -> network`. A later environment never substitutes for an
  earlier one. Production remains disabled until its own governance and
  infrastructure are approved.
- Demo persistence is explicitly disposable and environment-namespaced. The
  trusted BFF/Gateway may purge it administratively or by configured TTL; the
  browser cannot select a prefix, retention period or purge operation. Every
  Demo receipt remains labelled as virtual/in-memory ledger evidence even when
  the portal itself is publicly hosted.
- Do not run `npm publish`, build or publish a service image, merge a consumer,
  or deploy staging/Test Network while any affected local or local-network test
  is skipped, mocked across the boundary under test, pending, accepted as an
  error, or otherwise incomplete.
- An HTTP 200, unit mock, fixture page, screenshot, configured endpoint or
  in-memory receipt is not end-to-end, persistence, Fabric or deployment proof.
- For Fabric-affecting flows, local-network green means a real ledger write and
  authoritative readback. Test Network with one orderer is explicitly
  non-production and non-HA; never describe it as production resilience.

## Cumulative package closure

- Keep functional branches unreleased. Do not bump or publish once per branch
  or package simply because its isolated tests are green.
- Test the entire affected dependency chain with immutable `npm pack` tarballs
  installed `--no-save`. Never commit `file:`, Git, workspace, vendored
  tarball or unpublished registry references.
- After every temporary tarball gate, restore manifests and lockfiles to
  registry state before committing dependency state.
- Only after the complete affected `test` and `local-network` matrices are
  green, create one cumulative release branch, apply semantic versions once,
  and rerun the release-sensitive pack/export checks.
- Publish changed packages from the lowest dependency upward, verify each exact
  registry version, integrity and exported surface, then pin exact versions in
  consumers and regenerate lockfiles.
- Publish only the exact pushed `main` commit. Keep branch commit, explicit
  merge commit, pushed `main`, package publication, consumer pin, image,
  deployment and live E2E as separate evidence.
- A package already published prematurely is not evidence that the capability
  is operational. Record the mistake; do not compound it by publishing the
  remaining chain before its gates pass.

## Test and branch discipline

- Use red-green-refactor for every behavior change. The first run must fail
  because production behavior is missing or wrong.
- Every new or modified test file starts with a complete `Flow contract:`
  comment. E2E files enumerate the journey plus authorization and persistence
  invariants.
- Mocks may isolate units but never replace the real boundary being claimed.
- Use Node.js 24 for installs, builds, tests, packing and releases.
- Protect the developer workstation. Run heavy gates sequentially by default.
  Never run concurrent Next.js production builds, Playwright/browser suites,
  Docker or Fabric networks, package installs, image builds or full repository
  matrices. Parallel execution is allowed only for read-only inspection or
  demonstrably light, isolated unit tests with bounded workers and no shared
  ports, databases, caches or generated outputs. Stop parallel work if memory,
  CPU, thermals or responsiveness degrade.
- Preserve unrelated work. End each functional branch with changelog, pushed
  branch, explicit merge to `main`, pushed matching refs and a clean worktree;
  apply package versions only in the later cumulative release closure.

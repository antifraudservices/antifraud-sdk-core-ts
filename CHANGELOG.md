# Changelog

## Unreleased

- Consume `antifraud-data-utils-ts@0.1.7` and add the runtime-neutral managed
  signing-session controller.
- Bind each short-lived session to the authenticated user, registered device,
  operation, immutable manifest, relying party and purpose.
- Require biometric presence when available, allow governed PIN or password
  fallback otherwise, and fail closed on expiry, cancellation, lock, context
  change or replay.
- Keep login, review, delivery and read events explicitly separate from a
  managed-wallet signature.

## 0.1.3 - 2026-10-18

- Consume `antifraud-data-utils-ts@0.1.4` and orchestrate Schema.org
  confidential-document delivery through canonical inline or protected-link
  DIDComm attachments.
- Preserve trusted sender and recipient bindings, idempotent operation replay,
  exact byte-count agreement and separate delivery, read and signature states.

## 0.1.2 - 2026-10-18

- Replace binary qualification-issuer lookup with explicit
  `participant-resolved`, `identity-resolved` and `not-resolved` outcomes.
- Record employer evidence for a known non-participating issuer as
  `awaiting-issuer-onboarding` without fabricating a tenant or queueing a
  confirmation request.
- Reuse the canonical CIDv1(raw, SHA3-384) validator and synthetic attachment
  fixture from `antifraud-data-utils-ts@0.1.3` instead of duplicating the
  multibase and multihash implementation.

## 0.1.1 - 2026-10-17

- Add runtime-neutral authoritative credential issuance orchestration using
  canonical data-utils contracts, opaque polling continuity and terminal-state
  enforcement.

- Add runtime-neutral employer qualification-evidence orchestration, issuer
  discovery, privacy-minimized confirmation requests, issuer-owned decisions
  and reverse decision notifications.
- Document canonical Schema.org `MediaObject` evidence, its OpenID Identity
  Assurance attachment projection, SHA3-384 CID anchoring, tenant-to-tenant
  delivery, ledger recovery and W3C credential rendering.

- Add runtime-neutral OpenID4VP DCQL profiles, opaque presentation-session storage and presentation orchestration.
- Document reusable workforce authorization as active group membership plus a
  controller-managed group authorization, with optional subject authorization
  kept separate and no employee-specific Consent.
- Keep awarding-organization resolution, employer attestation, and
  source-issued qualification proof as distinct orchestration states.

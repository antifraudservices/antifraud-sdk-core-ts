# Antifraud SDK Core

Runtime-neutral orchestration contracts for identity verification, subject and relationship attestation, and provider-issued credentials.

## Status

Published public implementation foundation. Registry publication proves the
package artifact only; no deployment or production readiness is claimed.

## Responsibility

This package will coordinate application flows without depending on Node.js, React, a database, a ledger, a tenant, or a product.

It will reuse the canonical claims, JSON Schemas, mappings, and capability identifiers from [antifraud-data-utils-ts](https://github.com/antifraudservices/antifraud-data-utils-ts). It must not duplicate those literals.

The intended flow is:

1. A user interface or backend for frontend starts an identity presentation.
2. A trusted verifier validates the presentation and returns an opaque transaction result.
3. An authorized index provider reads the subject or relationship again from its authoritative source.
4. The index provider issues and signs the resulting credential.
5. The caller receives the credential or a stable reference, but never the provider signing key.

OpenID for Verifiable Presentations starts and verifies a wallet presentation. Credential issuance is a separate provider operation and may use OpenID for Verifiable Credential Issuance or another explicit issuer protocol. The two operations must never be described as one.

## Planned public API

- verification and attestation use-case ports;
- wallet-presentation session orchestration;
- authoritative-readback request and result types;
- credential-issuance request orchestration;
- deterministic flow states and errors;
- no transport, storage, framework, or signing implementation.

## Security boundary

No secrets, tenant configuration, trust anchors, personal data, signing keys, or operational endpoints belong in this repository.

The browser and a generic backend for frontend are untrusted for credential signing. Only the configured credential provider may sign after an authoritative readback and authorization check.

For managed user signatures, `ManagedSigningSessionController` binds one
short-lived session to the authenticated user, registered device, operation,
immutable manifest, relying party and purpose. It requires local biometric
presence when the device supports it, with PIN or password fallback only when
biometrics are unavailable. Cancellation, device lock, expiry, replay or any
context mismatch invalidates the ceremony. The controller receives only a
wallet port and returns a proof; private key material remains in the managed
wallet. Login, review, delivery and read events never count as signatures.

## Workforce group authorization

An employee does not receive a separate Consent merely by joining an
operational group. Orchestration must receive and keep distinct:

1. the employee's active assignment and active membership in the exact group;
2. the controller-managed authorization for that group and its exact
   capabilities;
3. when the use case requires it, a separate authorization from the subject or
   lawful representative.

Adding or removing one employee changes membership only. It must not recreate
or revoke the group authorization for the remaining members. Invitation,
acceptance, department or group reassignment, suspension, and reactivation are
separate assignment events that applications notify through Communication.
Those notifications are not authorization records.

The same orchestration contract can serve education, insurance, human health,
animal care, or other domains. Product applications select their own group
purposes and subject-authorization rules; this package must not embed them.

For employee qualification evidence, orchestration keeps organization
resolution, employer attestation, and source-issued credential proof as
separate states. An awarding organization is selected by legal identifier and
jurisdiction. If no source credential exists, the employer may sign its own
attestation but must not be represented as the awarding organization's issuer.

The implemented qualification-evidence controller records the employer's proof
through a trusted port and resolves the claimed issuer by legal identifier and
jurisdiction with three explicit outcomes. A participating issuer has a known
tenant and confirmation service, so the controller anchors opaque continuity
and queues a tenant-to-tenant confirmation request. A known legal identity
without a participating tenant is recorded as `awaiting-issuer-onboarding`
without sending a message or inventing tenant authority. An unresolved identity
fails before evidence recording. See [Qualification evidence confirmation prototype](docs/QUALIFICATION_EVIDENCE_CONFIRMATION.md)
for attachment, issuer notification, ledger recovery and credential-rendering
boundaries.

## Schema.org document delivery

Antifraud documents are Schema.org `DigitalDocument` resources with concrete
`MediaObject` encodings. They are never FHIR `DocumentReference` resources.
`createDocumentDeliveryController` consumes the canonical data-utils contract
and carries governed bytes through DIDComm `attachments[]`, inline or by
protected reference. Trusted sender, recipient and service bindings remain
server-owned; replay is operation-idempotent; receipt storage contains no raw
bytes. Delivery, read and signature remain distinct states.

## Dependency direction

```text
antifraud-data-utils-ts
          ↓
antifraud-sdk-core-ts
          ↓
antifraud-sdk-node-ts / antifraud-portal-components-react
          ↓
applications and services
```

## Implementation gate

Implementation begins with executable contract tests and proceeds in dependency order. A repository, type name, mock, or successful HTTP response is not evidence that a credential was verified or issued.

## License

Apache-2.0.

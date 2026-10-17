# Antifraud SDK Core

Runtime-neutral orchestration contracts for identity verification, subject and relationship attestation, and provider-issued credentials.

## Status

Public implementation foundation. No package has been published and no production readiness is claimed yet.

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


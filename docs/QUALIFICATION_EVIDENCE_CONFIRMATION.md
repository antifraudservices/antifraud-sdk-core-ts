# Qualification Evidence Confirmation Prototype

This document defines the product-neutral prototype for an employer that
records qualification evidence about an employee and asks the claimed issuer
to confirm it. It is an implementation contract, not evidence that tenant
transport, signing, ledger writes or issuer integration are deployed.

## What the employer creates

An authorized controller or human-resources employee selects an active
employee and records an employer attestation about evidence the employer
reviewed. The evidence may be a scanned PDF, PNG, JPEG or TIFF document. The
browser sends the file to its trusted backend; it never hashes, signs, stores
or publishes the authoritative record by itself.

The backend stores the binary in confidential storage. Canonical business
metadata represents it as a Schema.org `MediaObject` encoding of the
`EducationalOccupationalCredential`, with a protected `contentUrl`, media
type, size and CID identifier. The backend calculates two equivalent integrity
representations from the exact bytes:

- the OpenID Identity Assurance external-attachment digest, with negotiated
  algorithm `sha3-384` and the 48-byte digest encoded as base64;
- a CIDv1 using the `raw` codec, the SHA3-384 multihash and multibase
  base58btc encoding.

The attachment URL or storage reference must be protected and short-lived when
shared outside the home tenant. The file name is display metadata and must not
be used as an identifier. Blockchain receives the CID or an opaque anchor, not
the document, URL, access token, employee name, qualification identifier or
issuer legal identifier.

Schema.org `EducationalOccupationalCredential` flat claims describe the
qualification and its `MediaObject` encoding is the canonical reference to the
scan. OpenID Identity Assurance `verification.evidence` describes what was
examined and how. In that exchange projection, the same scan becomes a
`document` evidence attachment carrying its protected `url`, `digest.alg` and
base64 `digest.value`. The projection does not introduce a second stored file.

## Issuer discovery and request delivery

The employer identifies the claimed issuer by legal identifier and
jurisdiction. Its trusted backend asks the configured Inter-Cloud Agreement or
tenant directory for an authoritative organization record. A successful
resolution returns opaque organization and tenant references plus the issuer's
advertised qualification-confirmation service. Display name alone is never
sufficient.

The confirmation request is delivered as a signed tenant-to-tenant message
through a durable outbox. The transport adapter may use the negotiated
Inter-Cloud Agreement channel or wrap the payload in a DIDComm message. The
core message contains opaque evidence and qualification references, the CID,
media type, source and target tenant references, and an idempotent message
identifier. It contains no raw document and no bearer access token.

FHIR Subscription is not the primary protocol. This workflow is not limited
to healthcare and the qualification issuer might not operate a FHIR server. A
health application may project an accepted result into a FHIR Communication,
Provenance or Subscription-based notification for its own clients, but that is
a downstream SOS profile rather than the Antifraud inter-tenant contract.

## Issuer processing

The issuer tenant authenticates the sending tenant and message, resolves the
opaque request, and checks that the requested issuer organization is one it is
authorized to represent. It may then:

1. retrieve the protected evidence when policy permits and verify that its
   exact bytes reproduce the declared CID and OpenID attachment digest;
2. compare the evidence with its authoritative internal records;
3. locate an existing issuer credential and its current status; or
4. issue a new credential through an explicit issuer workflow when legally and
   operationally permitted.

The issuer returns one independently signed outcome: confirmed, rejected or
revoked. A confirmation adds the issuer's proof to the qualification; it does
not delete the employer proof. Rejection records that the issuer did not
confirm the assertion. Revocation invalidates the issuer-owned proof from that
point forward; it does not rewrite historical employer evidence.

The issuer sends the outcome to the employer's discovered notification
service through the same durable messaging pattern. The employer verifies the
issuer tenant and organization against the original resolved target before
applying it.

## Ledger role and recovery

The ledger is a status and audit boundary, not a mailbox or document store.
The primary path is tenant-to-tenant messaging because it supports delivery
receipts, retries, authentication, policy and protected attachment access.

Antifraud never turns this attachment into FHIR `DocumentReference`. Its
business representation is Schema.org `DigitalDocument` plus `MediaObject`.
The binary travels in DIDComm `attachments[]` as bounded base64url bytes or an
authorized link plus multihash. The canonical minimal-PDF contract is
[antifraud-data-utils-ts issue #2](https://github.com/antifraudservices/antifraud-data-utils-ts/issues/2),
and SDK orchestration is [issue #5](https://github.com/antifraudservices/antifraud-sdk-core-ts/issues/5).

An authorized ledger adapter may register a privacy-minimized evidence anchor
and later append the issuer-owned confirmation, rejection or revocation
status. Ledger events or addressed queries may be used to recover from a lost
message. The issuer tenant may query only anchors addressed to its protected
issuer reference; it must not scan by a public legal identifier or employee
identity.

Updating a ledger status does not by itself prove the qualification. The
consumer must verify the issuer proof, issuer authority, credential status,
jurisdiction and any separate professional licence required for the intended
operation.

## Verifiable credential and visual representation

If the issuer supplies a Verifiable Credential, the credential is distinct
from the employer's scan. The issuer may use the W3C
[Verifiable Credential Rendering Methods](https://www.w3.org/TR/vc-render-method/)
`renderMethod` extension to describe an issuer-intended human-readable
representation. Static or template-based rendering can produce images or PDF
output, but rendered output does not replace cryptographic verification of the
credential and its status.

The employer's scan must never be relabelled as an issuer-rendered credential.
If the issuer confirms that the scan matches an existing credential, the
result keeps both references: the employer evidence CID and the issuer
credential or proof reference.

## Prototype state and remaining runtime work

`createQualificationEvidenceController` now defines the runtime-neutral
orchestration ports and privacy-minimized confirmation request.
`applyQualificationIssuerDecision` enforces that only the originally resolved
issuer tenant and organization can supply the issuer-owned result.
`buildQualificationIssuerDecisionNotice` creates the reverse notification
envelope.

Still required before production are the Node.js Inter-Cloud Agreement
directory adapter, signed outbox transport, confidential artifact service,
issuer-side authoritative readback, credential verification or issuance,
ledger adapter, retry and dead-letter handling, and real local plus Test
Network end-to-end proof.

// Flow contract: 1. A trusted backend supplies verified controller, employer, employee and group-authorization references. 2. The employer records its own evidence attestation. 3. The claimed issuer is resolved by legal identifier and jurisdiction through an authoritative directory. 4. A privacy-minimized ledger anchor is recorded. 5. A signed tenant-to-tenant confirmation request is queued through an outbox. 6. Only the resolved issuer tenant may confirm, reject or revoke its own proof and a result notice is queued to the employer. Authorization invariant: the controller, employer, employee and issuer identities come from trusted server context, never browser-authored claims. Persistence invariant: raw evidence, personal claims and signed credentials remain off ledger; the core stores only opaque continuity and delegates durable writes to ports.
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyQualificationIssuerDecision,
  buildQualificationIssuerDecisionNotice,
  createQualificationEvidenceController,
} from '../dist/index.js'

const request = Object.freeze({
  trustedContext: Object.freeze({
    controllerAuthorizationReference: 'urn:authorization:controller-opaque',
    employerTenantReference: 'urn:tenant:employer-opaque',
    employerOrganizationReference: 'urn:organization:employer-opaque',
    employeeReference: 'urn:employee:opaque',
    groupAuthorizationReference: 'urn:authorization:group-opaque',
  }),
  qualificationClaimReference: 'urn:qualification-claim:opaque',
  claimedIssuer: Object.freeze({
    legalIdentifier: 'issuer-legal-id',
    jurisdiction: 'ES',
  }),
  evidence: Object.freeze({
    reference: 'urn:evidence-document:opaque',
    contentId: 'zKYrhS8ZkySGc9pjHe8KE4bo1RjKKbjaxatf3zM16DD2hLGPvK3bqbSGvpNYA2qafoUeBYT',
    mediaType: 'application/pdf',
    fileName: 'degree.pdf',
  }),
})

test('records employer evidence and queues an issuer confirmation request', async () => {
  const messages = []
  const anchors = []
  const controller = createQualificationEvidenceController({
    issuerDirectory: {
      resolve: async query => ({
        ...query,
        issuerTenantReference: 'urn:tenant:issuer-opaque',
        issuerOrganizationReference: 'urn:organization:issuer-opaque',
        confirmationServiceReference: 'urn:service:issuer-confirmation-opaque',
      }),
    },
    evidenceRecorder: {
      recordEmployerAttestation: async () => ({
        evidenceReference: 'urn:evidence:opaque',
        employerProofReference: 'urn:proof:employer-opaque',
        anchor: {
          anchorReference: 'urn:ledger-anchor:opaque',
          contentHash: 'urn:sha3-384:attestation-opaque',
        },
      }),
    },
    ledger: {
      recordAnchor: async anchor => { anchors.push(anchor) },
    },
    outbox: {
      queue: async message => {
        messages.push(message)
        return { messageReference: 'urn:message:request-opaque' }
      },
    },
    now: () => '2026-10-17T20:00:00.000Z',
  })

  const result = await controller.submit(request)

  assert.deepEqual(result, {
    phase: 'issuer-confirmation-queued',
    evidenceReference: 'urn:evidence:opaque',
    employerProofReference: 'urn:proof:employer-opaque',
    ledgerAnchorReference: 'urn:ledger-anchor:opaque',
    issuerTenantReference: 'urn:tenant:issuer-opaque',
    issuerOrganizationReference: 'urn:organization:issuer-opaque',
    requestMessageReference: 'urn:message:request-opaque',
  })
  assert.equal(anchors.length, 1)
  assert.deepEqual(messages[0], {
    messageType: 'qualification-evidence-confirmation-request',
    messageId: 'urn:message:qualification-evidence:urn:evidence:opaque',
    fromTenantReference: 'urn:tenant:employer-opaque',
    toTenantReference: 'urn:tenant:issuer-opaque',
    serviceReference: 'urn:service:issuer-confirmation-opaque',
    evidenceReference: 'urn:evidence:opaque',
    qualificationClaimReference: 'urn:qualification-claim:opaque',
    employerOrganizationReference: 'urn:organization:employer-opaque',
    claimedIssuerOrganizationReference: 'urn:organization:issuer-opaque',
    evidenceContentId: 'zKYrhS8ZkySGc9pjHe8KE4bo1RjKKbjaxatf3zM16DD2hLGPvK3bqbSGvpNYA2qafoUeBYT',
    evidenceMediaType: 'application/pdf',
    createdAt: '2026-10-17T20:00:00.000Z',
  })
  assert.equal(JSON.stringify(messages[0]).includes('issuer-legal-id'), false)
  assert.equal(JSON.stringify(messages[0]).includes('degree.pdf'), false)
})

test('rejects an issuer decision from a different tenant', () => {
  assert.throws(() => applyQualificationIssuerDecision({
    evidenceReference: 'urn:evidence:opaque',
    expectedIssuerTenantReference: 'urn:tenant:issuer-opaque',
    expectedIssuerOrganizationReference: 'urn:organization:issuer-opaque',
  }, {
    evidenceReference: 'urn:evidence:opaque',
    issuerTenantReference: 'urn:tenant:other-opaque',
    issuerOrganizationReference: 'urn:organization:issuer-opaque',
    decision: 'confirmed',
    issuerProofReference: 'urn:proof:issuer-opaque',
    decidedAt: '2026-10-18T10:00:00.000Z',
  }), /issuer tenant does not match/i)
})

test('keeps confirmation, rejection and revocation as issuer-owned outcomes', () => {
  const current = {
    evidenceReference: 'urn:evidence:opaque',
    expectedIssuerTenantReference: 'urn:tenant:issuer-opaque',
    expectedIssuerOrganizationReference: 'urn:organization:issuer-opaque',
  }
  const confirmed = applyQualificationIssuerDecision(current, {
    evidenceReference: 'urn:evidence:opaque',
    issuerTenantReference: 'urn:tenant:issuer-opaque',
    issuerOrganizationReference: 'urn:organization:issuer-opaque',
    decision: 'confirmed',
    issuerProofReference: 'urn:proof:issuer-opaque',
    decidedAt: '2026-10-18T10:00:00.000Z',
  })
  const revoked = applyQualificationIssuerDecision(current, {
    evidenceReference: 'urn:evidence:opaque',
    issuerTenantReference: 'urn:tenant:issuer-opaque',
    issuerOrganizationReference: 'urn:organization:issuer-opaque',
    decision: 'revoked',
    issuerProofReference: 'urn:proof:issuer-revocation-opaque',
    decidedAt: '2026-10-19T10:00:00.000Z',
  })

  assert.equal(confirmed.status, 'issuer-confirmed')
  assert.equal(revoked.status, 'issuer-revoked')
  assert.notEqual(confirmed.issuerProofReference, revoked.issuerProofReference)

  assert.deepEqual(buildQualificationIssuerDecisionNotice({
    outcome: revoked,
    employerTenantReference: 'urn:tenant:employer-opaque',
    issuerTenantReference: 'urn:tenant:issuer-opaque',
    employerNotificationServiceReference: 'urn:service:employer-notification-opaque',
    createdAt: '2026-10-19T10:00:01.000Z',
  }), {
    messageType: 'qualification-evidence-issuer-decision',
    messageId: 'urn:message:qualification-evidence-decision:urn:evidence:opaque:issuer-revoked',
    fromTenantReference: 'urn:tenant:issuer-opaque',
    toTenantReference: 'urn:tenant:employer-opaque',
    serviceReference: 'urn:service:employer-notification-opaque',
    evidenceReference: 'urn:evidence:opaque',
    status: 'issuer-revoked',
    issuerProofReference: 'urn:proof:issuer-revocation-opaque',
    createdAt: '2026-10-19T10:00:01.000Z',
  })
})

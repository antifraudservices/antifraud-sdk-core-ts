// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import { assertSha3_384EvidenceContentId } from 'antifraud-data-utils-ts'

export type QualificationIssuerQuery = Readonly<{
  legalIdentifier: string
  jurisdiction: string
}>

export type ResolvedQualificationIssuer = QualificationIssuerQuery & Readonly<{
  issuerTenantReference: string
  issuerOrganizationReference: string
  confirmationServiceReference: string
}>

export type QualificationIssuerResolution =
  | Readonly<{
      kind: 'participant-resolved'
      issuer: ResolvedQualificationIssuer
    }>
  | Readonly<{
      kind: 'identity-resolved'
      issuerOrganizationReference: string
    }>
  | Readonly<{
      kind: 'not-resolved'
    }>

export type QualificationEvidenceRequest = Readonly<{
  trustedContext: Readonly<{
    controllerAuthorizationReference: string
    employerTenantReference: string
    employerOrganizationReference: string
    employeeReference: string
    groupAuthorizationReference: string
  }>
  qualificationClaimReference: string
  claimedIssuer: QualificationIssuerQuery
  evidence: Readonly<{
    reference: string
    contentId: string
    mediaType: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/tiff'
    fileName: string
  }>
}>

export type QualificationConfirmationRequestMessage = Readonly<{
  messageType: 'qualification-evidence-confirmation-request'
  messageId: string
  fromTenantReference: string
  toTenantReference: string
  serviceReference: string
  evidenceReference: string
  qualificationClaimReference: string
  employerOrganizationReference: string
  claimedIssuerOrganizationReference: string
  evidenceContentId: string
  evidenceMediaType: QualificationEvidenceRequest['evidence']['mediaType']
  createdAt: string
}>

export type QualificationEvidenceControllerPorts = Readonly<{
  issuerDirectory: Readonly<{
    resolve(query: QualificationIssuerQuery): Promise<QualificationIssuerResolution>
  }>
  evidenceRecorder: Readonly<{
    recordEmployerAttestation(request: QualificationEvidenceRequest): Promise<Readonly<{
      evidenceReference: string
      employerProofReference: string
      anchor: Readonly<{
        anchorReference: string
        contentHash: string
      }>
    }>>
  }>
  ledger: Readonly<{
    recordAnchor(anchor: Readonly<{
      anchorReference: string
      evidenceReference: string
      contentHash: string
      issuerOrganizationReference: string
    }> & (
      | Readonly<{
          issuerTenantReference: string
          lifecycleStatus: 'awaiting-issuer-confirmation'
        }>
      | Readonly<{
          lifecycleStatus: 'awaiting-issuer-onboarding'
        }>
    )): Promise<void>
  }>
  outbox: Readonly<{
    queue(message: QualificationConfirmationRequestMessage): Promise<Readonly<{
      messageReference: string
    }>>
  }>
  now(): string
}>

function requireReference(value: string, path: string): void {
  if (value.trim().length === 0) throw new TypeError(`${path} must not be empty`)
}

function validateRequest(request: QualificationEvidenceRequest): void {
  requireReference(request.trustedContext.controllerAuthorizationReference, 'controllerAuthorizationReference')
  requireReference(request.trustedContext.employerTenantReference, 'employerTenantReference')
  requireReference(request.trustedContext.employerOrganizationReference, 'employerOrganizationReference')
  requireReference(request.trustedContext.employeeReference, 'employeeReference')
  requireReference(request.trustedContext.groupAuthorizationReference, 'groupAuthorizationReference')
  requireReference(request.qualificationClaimReference, 'qualificationClaimReference')
  requireReference(request.claimedIssuer.legalIdentifier, 'claimedIssuer.legalIdentifier')
  requireReference(request.claimedIssuer.jurisdiction, 'claimedIssuer.jurisdiction')
  requireReference(request.evidence.reference, 'evidence.reference')
  assertSha3_384EvidenceContentId(request.evidence.contentId)
}

export function createQualificationEvidenceController(
  ports: QualificationEvidenceControllerPorts,
) {
  return {
    async submit(request: QualificationEvidenceRequest) {
      validateRequest(request)
      const resolution = await ports.issuerDirectory.resolve(request.claimedIssuer)
      if (resolution.kind === 'not-resolved') {
        return Object.freeze({ phase: 'issuer-not-resolved' as const })
      }

      const recorded = await ports.evidenceRecorder.recordEmployerAttestation(request)
      if (resolution.kind === 'identity-resolved') {
        await ports.ledger.recordAnchor({
          anchorReference: recorded.anchor.anchorReference,
          evidenceReference: recorded.evidenceReference,
          contentHash: recorded.anchor.contentHash,
          issuerOrganizationReference: resolution.issuerOrganizationReference,
          lifecycleStatus: 'awaiting-issuer-onboarding',
        })
        return Object.freeze({
          phase: 'awaiting-issuer-onboarding' as const,
          evidenceReference: recorded.evidenceReference,
          employerProofReference: recorded.employerProofReference,
          ledgerAnchorReference: recorded.anchor.anchorReference,
          issuerOrganizationReference: resolution.issuerOrganizationReference,
        })
      }

      const issuer = resolution.issuer
      await ports.ledger.recordAnchor({
        anchorReference: recorded.anchor.anchorReference,
        evidenceReference: recorded.evidenceReference,
        contentHash: recorded.anchor.contentHash,
        issuerTenantReference: issuer.issuerTenantReference,
        issuerOrganizationReference: issuer.issuerOrganizationReference,
        lifecycleStatus: 'awaiting-issuer-confirmation',
      })

      const message: QualificationConfirmationRequestMessage = Object.freeze({
        messageType: 'qualification-evidence-confirmation-request',
        messageId: `urn:message:qualification-evidence:${recorded.evidenceReference}`,
        fromTenantReference: request.trustedContext.employerTenantReference,
        toTenantReference: issuer.issuerTenantReference,
        serviceReference: issuer.confirmationServiceReference,
        evidenceReference: recorded.evidenceReference,
        qualificationClaimReference: request.qualificationClaimReference,
        employerOrganizationReference: request.trustedContext.employerOrganizationReference,
        claimedIssuerOrganizationReference: issuer.issuerOrganizationReference,
        evidenceContentId: request.evidence.contentId,
        evidenceMediaType: request.evidence.mediaType,
        createdAt: ports.now(),
      })
      const delivery = await ports.outbox.queue(message)

      return Object.freeze({
        phase: 'issuer-confirmation-queued' as const,
        evidenceReference: recorded.evidenceReference,
        employerProofReference: recorded.employerProofReference,
        ledgerAnchorReference: recorded.anchor.anchorReference,
        issuerTenantReference: issuer.issuerTenantReference,
        issuerOrganizationReference: issuer.issuerOrganizationReference,
        requestMessageReference: delivery.messageReference,
      })
    },
  }
}

export type QualificationIssuerDecision = Readonly<{
  evidenceReference: string
  issuerTenantReference: string
  issuerOrganizationReference: string
  decision: 'confirmed' | 'rejected' | 'revoked'
  issuerProofReference: string
  decidedAt: string
}>

export type QualificationIssuerOutcome = Readonly<{
  evidenceReference: string
  status: 'issuer-confirmed' | 'issuer-rejected' | 'issuer-revoked'
  issuerProofReference: string
  decidedAt: string
}>

export function applyQualificationIssuerDecision(
  current: Readonly<{
    evidenceReference: string
    expectedIssuerTenantReference: string
    expectedIssuerOrganizationReference: string
  }>,
  decision: QualificationIssuerDecision,
): QualificationIssuerOutcome {
  if (decision.evidenceReference !== current.evidenceReference) {
    throw new TypeError('Issuer decision evidence does not match')
  }
  if (decision.issuerTenantReference !== current.expectedIssuerTenantReference) {
    throw new TypeError('Issuer tenant does not match')
  }
  if (decision.issuerOrganizationReference !== current.expectedIssuerOrganizationReference) {
    throw new TypeError('Issuer organization does not match')
  }
  requireReference(decision.issuerProofReference, 'issuerProofReference')
  requireReference(decision.decidedAt, 'decidedAt')
  return Object.freeze({
    evidenceReference: decision.evidenceReference,
    status: `issuer-${decision.decision}`,
    issuerProofReference: decision.issuerProofReference,
    decidedAt: decision.decidedAt,
  })
}

export type QualificationIssuerDecisionNotice = Readonly<{
  messageType: 'qualification-evidence-issuer-decision'
  messageId: string
  fromTenantReference: string
  toTenantReference: string
  serviceReference: string
  evidenceReference: string
  status: QualificationIssuerOutcome['status']
  issuerProofReference: string
  createdAt: string
}>

export function buildQualificationIssuerDecisionNotice(input: Readonly<{
  outcome: QualificationIssuerOutcome
  employerTenantReference: string
  issuerTenantReference: string
  employerNotificationServiceReference: string
  createdAt: string
}>): QualificationIssuerDecisionNotice {
  return Object.freeze({
    messageType: 'qualification-evidence-issuer-decision',
    messageId:
      `urn:message:qualification-evidence-decision:${input.outcome.evidenceReference}:${input.outcome.status}`,
    fromTenantReference: input.issuerTenantReference,
    toTenantReference: input.employerTenantReference,
    serviceReference: input.employerNotificationServiceReference,
    evidenceReference: input.outcome.evidenceReference,
    status: input.outcome.status,
    issuerProofReference: input.outcome.issuerProofReference,
    createdAt: input.createdAt,
  })
}

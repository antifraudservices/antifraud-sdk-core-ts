import type { OpenId4VpProfile } from './openid4vp.js'
import type { PresentationSession } from './presentation-session.js'

export interface PresentationTransaction {
  transaction_id: string
  client_id: string
  request_uri: string
  request_uri_method: 'get' | 'post' | 'post_get'
}

export type PresentationResult =
  | { outcome: 'pending' }
  | { outcome: 'verified' }
  | { outcome: 'denied'; reason?: string }
  | { outcome: 'failed'; reason?: string }

interface PresentationVerifier {
  initialize(profile: OpenId4VpProfile): Promise<PresentationTransaction>
  getResult(transactionId: string): Promise<PresentationResult>
}

interface SessionRepository {
  save(session: PresentationSession): Promise<void>
  clear(): Promise<void>
}

interface PresentationControllerOptions {
  verifier: PresentationVerifier
  sessionRepository: SessionRepository
  openWallet(uri: string): Promise<void>
  now(): string
}

export type PresentationState =
  | { phase: 'idle' }
  | { phase: 'waiting'; transactionId: string }
  | { phase: 'verified'; transactionId: string }
  | { phase: 'denied'; transactionId: string; reason?: string }
  | { phase: 'failed'; transactionId: string; reason?: string }

export function buildHaipAuthorizationUri(transaction: PresentationTransaction): string {
  const parameters = new URLSearchParams({
    client_id: transaction.client_id,
    request_uri: transaction.request_uri,
    request_uri_method: transaction.request_uri_method,
  })
  return `haip-vp://?${parameters.toString()}`
}

export function createPresentationController(options: PresentationControllerOptions) {
  return {
    async start(profile: OpenId4VpProfile): Promise<PresentationState> {
      const transaction = await options.verifier.initialize(profile)
      await options.sessionRepository.save({
        transactionId: transaction.transaction_id,
        requestUri: transaction.request_uri,
        createdAt: options.now(),
      })
      await options.openWallet(buildHaipAuthorizationUri(transaction))
      return { phase: 'waiting', transactionId: transaction.transaction_id }
    },

    async refresh(transactionId: string): Promise<PresentationState> {
      const result = await options.verifier.getResult(transactionId)
      if (result.outcome === 'pending') {
        return { phase: 'waiting', transactionId }
      }

      await options.sessionRepository.clear()
      if (result.outcome === 'verified') {
        return { phase: 'verified', transactionId }
      }
      return {
        phase: result.outcome,
        transactionId,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
      }
    },
  }
}


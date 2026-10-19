import {
  ManagedSignatureRequestState,
  UserPresenceMethod,
  defineManagedSignatureProof,
  defineManagedSignatureRequest,
  type ManagedSignatureProof,
  type ManagedSignatureProofResult,
  type ManagedSignatureRequest,
  type ManagedSignatureRequestDraft,
  type ManagedSignatureRequestStateValue,
  type ManagedSignatureTrustedContext,
  type UserPresenceMethodValue,
} from 'antifraud-data-utils-ts'

type ManagedSigningSession = Omit<ManagedSignatureRequest, 'state'> & Readonly<{
  state: ManagedSignatureRequestStateValue
  invalidatedBy?: 'cancel' | 'lock'
}>

export type ManagedSigningBoundContext = Readonly<{
  requestId: string
  authenticatedUserId: string
  registeredDeviceId: string
  operationId: string
  manifestDigest: string
  relyingParty: string
  purpose: string
}>

export type ManagedSigningAuthorization = ManagedSigningBoundContext & Readonly<{
  method: UserPresenceMethodValue
  authorizedAt: string
}>

export type ManagedSigningExecution = ManagedSigningBoundContext & Readonly<{
  signedAt: string
}>

export type ManagedSigningSessionRepository = Readonly<{
  create(request: ManagedSignatureRequest): Promise<ManagedSigningSession>
  get(requestId: string): Promise<ManagedSigningSession | undefined>
  replaceIfState(
    requestId: string,
    expected: ManagedSignatureRequestStateValue,
    next: ManagedSigningSession,
  ): Promise<boolean>
}>

export type ManagedSigningUserPresencePort = Readonly<{
  verify(input: Readonly<{
    requestId: string
    registeredDeviceId: string
    method: UserPresenceMethodValue
  }>): Promise<Readonly<{
    biometricAvailable: boolean
    verified: boolean
    method: UserPresenceMethodValue
  }>>
}>

export type ManagedSigningWalletPort = Readonly<{
  signManifest(
    request: ManagedSignatureRequest,
    signedAt: string,
  ): Promise<ManagedSignatureProofResult>
}>

function sessionWithState(
  request: ManagedSigningSession,
  state: ManagedSignatureRequestStateValue,
  invalidatedBy?: 'cancel' | 'lock',
): ManagedSigningSession {
  return Object.freeze({ ...request, state, ...(invalidatedBy ? { invalidatedBy } : {}) })
}

function asPendingRequest(session: ManagedSigningSession): ManagedSignatureRequest {
  return Object.freeze({ ...session, state: ManagedSignatureRequestState.Pending })
}

function assertContext(session: ManagedSigningSession, context: ManagedSigningBoundContext): void {
  const matches = session.requestId === context.requestId
    && session.authenticatedUserId === context.authenticatedUserId
    && session.registeredDeviceId === context.registeredDeviceId
    && session.operationId === context.operationId
    && session.manifest.digest === context.manifestDigest
    && session.relyingParty === context.relyingParty
    && session.purpose === context.purpose
  if (!matches) throw new Error('Managed signing context mismatch')
}

function requireSession(
  session: ManagedSigningSession | undefined,
  requestId: string,
): ManagedSigningSession {
  if (!session) throw new Error(`Managed signing session ${requestId} was not found`)
  return session
}

/** Runtime-neutral orchestration; storage, user presence and key custody remain ports. */
export class ManagedSigningSessionController {
  readonly #repository: ManagedSigningSessionRepository
  readonly #userPresence: ManagedSigningUserPresencePort
  readonly #wallet: ManagedSigningWalletPort

  constructor(dependencies: Readonly<{
    repository: ManagedSigningSessionRepository
    userPresence: ManagedSigningUserPresencePort
    wallet: ManagedSigningWalletPort
  }>) {
    this.#repository = dependencies.repository
    this.#userPresence = dependencies.userPresence
    this.#wallet = dependencies.wallet
  }

  async create(
    draft: ManagedSignatureRequestDraft & Readonly<Record<string, unknown>>,
    trustedContext: ManagedSignatureTrustedContext,
  ): Promise<ManagedSigningSession> {
    return this.#repository.create(defineManagedSignatureRequest(draft, trustedContext))
  }

  async authorize(input: ManagedSigningAuthorization): Promise<ManagedSigningSession> {
    const current = requireSession(await this.#repository.get(input.requestId), input.requestId)
    if (current.state !== ManagedSignatureRequestState.Pending) {
      throw new Error('Managed signing session is not pending')
    }
    assertContext(current, input)
    if (Date.parse(input.authorizedAt) >= Date.parse(current.expiresAt)) {
      await this.#repository.replaceIfState(
        current.requestId,
        ManagedSignatureRequestState.Pending,
        sessionWithState(current, ManagedSignatureRequestState.Expired),
      )
      throw new Error('Managed signing session expired')
    }

    const presence = await this.#userPresence.verify({
      requestId: current.requestId,
      registeredDeviceId: current.registeredDeviceId,
      method: input.method,
    })
    if (!presence.verified) throw new Error('Local user presence was not verified')
    if (presence.biometricAvailable && presence.method !== UserPresenceMethod.Biometric) {
      throw new Error('Local biometric presence is required when available')
    }
    if (
      !presence.biometricAvailable
      && presence.method !== UserPresenceMethod.Pin
      && presence.method !== UserPresenceMethod.Password
    ) {
      throw new Error('PIN or password fallback is required when biometrics are unavailable')
    }

    const authorized = sessionWithState(current, ManagedSignatureRequestState.Authorized)
    if (!await this.#repository.replaceIfState(
      current.requestId,
      ManagedSignatureRequestState.Pending,
      authorized,
    )) {
      throw new Error('Managed signing session changed during authorization')
    }
    return authorized
  }

  async sign(input: ManagedSigningExecution): Promise<ManagedSignatureProof> {
    const current = requireSession(await this.#repository.get(input.requestId), input.requestId)
    if (current.state === ManagedSignatureRequestState.Signed) {
      throw new Error('Managed signing session was already consumed')
    }
    if (current.state !== ManagedSignatureRequestState.Authorized) {
      throw new Error('Managed signing session is not authorized')
    }
    assertContext(current, input)
    if (Date.parse(input.signedAt) > Date.parse(current.expiresAt)) {
      await this.#repository.replaceIfState(
        current.requestId,
        ManagedSignatureRequestState.Authorized,
        sessionWithState(current, ManagedSignatureRequestState.Expired),
      )
      throw new Error('Managed signing session expired')
    }

    const consumed = sessionWithState(current, ManagedSignatureRequestState.Signed)
    if (!await this.#repository.replaceIfState(
      current.requestId,
      ManagedSignatureRequestState.Authorized,
      consumed,
    )) {
      throw new Error('Managed signing session was already consumed')
    }

    try {
      const result = await this.#wallet.signManifest(asPendingRequest(current), input.signedAt)
      return defineManagedSignatureProof(asPendingRequest(current), result)
    } catch (error) {
      await this.#repository.replaceIfState(
        current.requestId,
        ManagedSignatureRequestState.Signed,
        sessionWithState(current, ManagedSignatureRequestState.Failed),
      )
      throw error
    }
  }

  async cancel(requestId: string): Promise<ManagedSigningSession> {
    return this.#invalidate(requestId, 'cancel')
  }

  async lock(requestId: string): Promise<ManagedSigningSession> {
    return this.#invalidate(requestId, 'lock')
  }

  async #invalidate(
    requestId: string,
    reason: 'cancel' | 'lock',
  ): Promise<ManagedSigningSession> {
    const current = requireSession(await this.#repository.get(requestId), requestId)
    const invalidated = sessionWithState(
      current,
      ManagedSignatureRequestState.Cancelled,
      reason,
    )
    if (!await this.#repository.replaceIfState(requestId, current.state, invalidated)) {
      throw new Error('Managed signing session changed during invalidation')
    }
    return invalidated
  }

  async recordNonSigningEvent(
    requestId: string,
    event: 'login' | 'review' | 'delivery' | 'read',
  ): Promise<ManagedSigningSession> {
    void event
    return requireSession(await this.#repository.get(requestId), requestId)
  }
}

export function createManagedSigningSessionRepositoryInMemory(): ManagedSigningSessionRepository {
  const sessions = new Map<string, ManagedSigningSession>()
  return Object.freeze({
    async create(request) {
      if (sessions.has(request.requestId)) {
        throw new Error(`Managed signing session ${request.requestId} already exists`)
      }
      const session = Object.freeze({ ...request })
      sessions.set(request.requestId, session)
      return session
    },
    async get(requestId) {
      return sessions.get(requestId)
    },
    async replaceIfState(requestId, expected, next) {
      const current = sessions.get(requestId)
      if (!current || current.state !== expected) return false
      sessions.set(requestId, Object.freeze({ ...next }))
      return true
    },
  })
}

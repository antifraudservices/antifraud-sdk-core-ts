// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ManagedSignatureRequestState,
  SyntheticManagedSignatureRequestFixture,
  UserPresenceMethod,
} from 'antifraud-data-utils-ts'
import {
  ManagedSigningSessionController,
  createManagedSigningSessionRepositoryInMemory,
} from '../dist/index.js'

const fixture = SyntheticManagedSignatureRequestFixture
const authorizedAt = '2026-10-18T20:01:00.000Z'
const signedAt = '2026-10-18T20:02:00.000Z'

function signingContext() {
  return {
    requestId: fixture.draft.requestId,
    authenticatedUserId: fixture.trustedContext.authenticatedUserId,
    registeredDeviceId: fixture.trustedContext.registeredDeviceId,
    operationId: fixture.draft.operationId,
    manifestDigest: fixture.draft.manifest.digest,
    relyingParty: fixture.trustedContext.relyingParty,
    purpose: fixture.trustedContext.purpose,
  }
}

function buildController({ biometricAvailable = true, presenceVerified = true } = {}) {
  const walletCalls = []
  const repository = createManagedSigningSessionRepositoryInMemory()
  const controller = new ManagedSigningSessionController({
    repository,
    userPresence: {
      async verify({ method }) {
        return { biometricAvailable, verified: presenceVerified, method }
      },
    },
    wallet: {
      async signManifest(request) {
        walletCalls.push(request)
        return {
          proofId: 'urn:proof:synthetic-publication-v1',
          signature: 'c3ludGhldGljLXNpZ25hdHVyZQ',
          createdAt: signedAt,
          verified: true,
        }
      },
    },
  })
  return { controller, repository, walletCalls }
}

test('requires biometric presence when the registered device supports it and produces one verified proof', async () => {
  const { controller, walletCalls } = buildController()
  const request = await controller.create(fixture.draft, fixture.trustedContext)

  assert.equal(request.state, ManagedSignatureRequestState.Pending)
  await controller.authorize({
    ...signingContext(),
    method: UserPresenceMethod.Biometric,
    authorizedAt,
  })
  const proof = await controller.sign({ ...signingContext(), signedAt })

  assert.equal(proof.requestId, fixture.draft.requestId)
  assert.equal(proof.manifest.digest, fixture.draft.manifest.digest)
  assert.equal(proof.relyingParty, fixture.trustedContext.relyingParty)
  assert.equal(walletCalls.length, 1)
  await assert.rejects(
    controller.sign({ ...signingContext(), signedAt }),
    /already consumed/u,
  )
})

test('allows governed PIN or password fallback only when biometrics are unavailable', async () => {
  for (const method of [UserPresenceMethod.Pin, UserPresenceMethod.Password]) {
    const { controller } = buildController({ biometricAvailable: false })
    await controller.create(fixture.draft, fixture.trustedContext)
    await controller.authorize({ ...signingContext(), method, authorizedAt })
    const proof = await controller.sign({ ...signingContext(), signedAt })
    assert.equal(proof.requestId, fixture.draft.requestId)
  }

  const { controller } = buildController({ biometricAvailable: true })
  await controller.create(fixture.draft, fixture.trustedContext)
  await assert.rejects(
    controller.authorize({
      ...signingContext(),
      method: UserPresenceMethod.Pin,
      authorizedAt,
    }),
    /biometric presence is required/u,
  )
})

test('fails closed before wallet access for presence failure or any bound-context mismatch', async () => {
  const mismatches = [
    ['authenticatedUserId', 'urn:user:other'],
    ['registeredDeviceId', 'urn:device:other'],
    ['operationId', 'urn:operation:other'],
    ['manifestDigest', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['relyingParty', 'https://other.example'],
    ['purpose', 'other-purpose'],
  ]

  for (const [field, value] of mismatches) {
    const { controller, walletCalls } = buildController()
    await controller.create(fixture.draft, fixture.trustedContext)
    await assert.rejects(
      controller.authorize({
        ...signingContext(),
        [field]: value,
        method: UserPresenceMethod.Biometric,
        authorizedAt,
      }),
      /signing context mismatch/u,
    )
    assert.equal(walletCalls.length, 0)
  }

  const { controller, walletCalls } = buildController({ presenceVerified: false })
  await controller.create(fixture.draft, fixture.trustedContext)
  await assert.rejects(
    controller.authorize({
      ...signingContext(),
      method: UserPresenceMethod.Biometric,
      authorizedAt,
    }),
    /user presence was not verified/u,
  )
  assert.equal(walletCalls.length, 0)
})

test('expires, cancels and locks sessions without treating login, review, delivery or read as signing', async () => {
  const { controller, walletCalls } = buildController()
  await controller.create(fixture.draft, fixture.trustedContext)

  for (const event of ['login', 'review', 'delivery', 'read']) {
    const current = await controller.recordNonSigningEvent(fixture.draft.requestId, event)
    assert.equal(current.state, ManagedSignatureRequestState.Pending)
  }

  await assert.rejects(
    controller.authorize({
      ...signingContext(),
      method: UserPresenceMethod.Biometric,
      authorizedAt: fixture.draft.expiresAt,
    }),
    /expired/u,
  )
  assert.equal(walletCalls.length, 0)

  for (const invalidation of ['cancel', 'lock']) {
    const run = buildController()
    await run.controller.create(fixture.draft, fixture.trustedContext)
    await run.controller[invalidation](fixture.draft.requestId)
    await assert.rejects(
      run.controller.authorize({
        ...signingContext(),
        method: UserPresenceMethod.Biometric,
        authorizedAt,
      }),
      /not pending/u,
    )
    assert.equal(run.walletCalls.length, 0)
  }
})

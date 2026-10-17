// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  OPENID4VP_PROFILES,
  buildDcqlQuery,
  buildHaipAuthorizationUri,
  createPresentationController,
  createPresentationSessionRepository,
} from '../dist/index.js'

test('builds a minimal EUDI PID query without retention', () => {
  const query = buildDcqlQuery(OPENID4VP_PROFILES.eudiPid)

  assert.equal(query.credentials.length, 2)
  assert.deepEqual(query.credential_sets, [{ options: [['pid_mdoc'], ['pid_sd_jwt']] }])
  for (const credential of query.credentials) {
    for (const claim of credential.claims) {
      if (credential.format === 'mso_mdoc') assert.equal(claim.intent_to_retain, false)
    }
  }
})

test('stores only opaque presentation continuity and rejects additional fields', async () => {
  const values = new Map()
  const repository = createPresentationSessionRepository({
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async (key) => values.delete(key),
  })
  const session = {
    transactionId: 'opaque-transaction',
    requestUri: 'https://verifier.example/request/opaque',
    createdAt: '2026-10-17T00:00:00.000Z',
  }

  await repository.save(session)
  assert.deepEqual(await repository.load(), session)

  values.set('openid4vp.presentation.session', JSON.stringify({
    ...session,
    vp_token: 'must-not-be-retained',
  }))
  assert.equal(await repository.load(), null)
})

test('starts and completes presentation without returning wallet claims', async () => {
  const saved = []
  const cleared = []
  const opened = []
  const controller = createPresentationController({
    verifier: {
      initialize: async () => ({
        transaction_id: 'opaque-transaction',
        client_id: 'x509_san_dns:verifier.example',
        request_uri: 'https://verifier.example/request/opaque',
        request_uri_method: 'get',
      }),
      getResult: async () => ({ outcome: 'verified' }),
    },
    sessionRepository: {
      save: async (session) => saved.push(session),
      clear: async () => cleared.push(true),
    },
    openWallet: async (uri) => opened.push(uri),
    now: () => '2026-10-17T00:00:00.000Z',
  })

  const waiting = await controller.start(OPENID4VP_PROFILES.eudiPid)
  assert.deepEqual(waiting, { phase: 'waiting', transactionId: 'opaque-transaction' })
  assert.equal(saved.length, 1)
  assert.equal(opened[0], buildHaipAuthorizationUri({
    transaction_id: 'opaque-transaction',
    client_id: 'x509_san_dns:verifier.example',
    request_uri: 'https://verifier.example/request/opaque',
    request_uri_method: 'get',
  }))

  const verified = await controller.refresh('opaque-transaction')
  assert.deepEqual(verified, { phase: 'verified', transactionId: 'opaque-transaction' })
  assert.equal(cleared.length, 1)
  assert.equal('claims' in verified, false)
})


// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CredentialIssuanceStatus,
  credentialIssuanceRequestFixture,
} from 'antifraud-data-utils-ts'

import {createCredentialIssuanceController} from '../dist/index.js'

test('requests provider issuance without accepting caller-authored claims', async () => {
  const calls = []
  const controller = createCredentialIssuanceController({
    provider: {
      requestIssuance: async (request) => {
        calls.push(request)
        return {
          issuanceId: 'issuance-synthetic-001',
          status: CredentialIssuanceStatus.Issued,
          credentialReference: 'urn:credential:synthetic-001',
        }
      },
      getIssuance: async () => { throw new Error('unexpected poll') },
    },
    wait: async () => {},
  })

  await assert.rejects(
    controller.issue({...credentialIssuanceRequestFixture, claims: {name: 'forbidden'}}),
    /Caller-supplied claims/,
  )
  assert.deepEqual(calls, [])

  const receipt = await controller.issue(credentialIssuanceRequestFixture)
  assert.equal(receipt.status, CredentialIssuanceStatus.Issued)
  assert.deepEqual(calls, [credentialIssuanceRequestFixture])
})

test('polls opaque continuity until the provider reaches a terminal state', async () => {
  const statuses = [
    CredentialIssuanceStatus.Pending,
    CredentialIssuanceStatus.Issued,
  ]
  const waits = []
  const controller = createCredentialIssuanceController({
    provider: {
      requestIssuance: async () => ({
        issuanceId: 'issuance-synthetic-001',
        status: CredentialIssuanceStatus.Pending,
      }),
      getIssuance: async (issuanceId) => ({
        issuanceId,
        status: statuses.shift(),
        ...(statuses.length === 0
          ? {credentialReference: 'urn:credential:synthetic-001'}
          : {}),
      }),
    },
    wait: async (milliseconds) => waits.push(milliseconds),
  })

  const receipt = await controller.issue(credentialIssuanceRequestFixture, {
    maxPollAttempts: 2,
    pollIntervalMilliseconds: 25,
  })
  assert.equal(receipt.status, CredentialIssuanceStatus.Issued)
  assert.deepEqual(waits, [25, 25])
})

test('fails when the provider changes the issuance identifier during polling', async () => {
  const controller = createCredentialIssuanceController({
    provider: {
      requestIssuance: async () => ({
        issuanceId: 'issuance-synthetic-001',
        status: CredentialIssuanceStatus.Pending,
      }),
      getIssuance: async () => ({
        issuanceId: 'issuance-confused-deputy',
        status: CredentialIssuanceStatus.Issued,
        credentialReference: 'urn:credential:synthetic-001',
      }),
    },
    wait: async () => {},
  })

  await assert.rejects(
    controller.issue(credentialIssuanceRequestFixture),
    /changed issuance identifier/,
  )
})

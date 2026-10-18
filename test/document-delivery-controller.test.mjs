// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
// Journey: (1) receive trusted sender and recipient bindings; (2) build the canonical Schema.org document graph;
// (3) prepare exact PDF bytes or a protected link as a DIDComm attachment; (4) deliver once; (5) replay idempotently.
// Authorization invariant: sender, recipient and service bindings come from trusted server context, never the browser.
// Persistence invariant: the receipt store retains only operation continuity and delivery state, never attachment bytes.
import assert from 'node:assert/strict'
import test from 'node:test'

import { SyntheticConfidentialDocumentFixture } from 'antifraud-data-utils-ts'

import { createDocumentDeliveryController } from '../dist/index.js'

const minimalPdfBytes = new TextEncoder().encode('%PDF-1.4\n%%EOF\n')

function request(attachment) {
  return Object.freeze({
    operationId: 'urn:operation:document-delivery-opaque',
    messageId: 'urn:message:document-delivery-opaque',
    trustedContext: Object.freeze({
      senderReference: 'did:example:sender',
      recipientReference: 'did:example:recipient',
      serviceReference: 'did:example:recipient#didcomm',
    }),
    manifest: SyntheticConfidentialDocumentFixture.manifest,
    document: SyntheticConfidentialDocumentFixture.document,
    attachment,
  })
}

function controllerFixture() {
  const sent = []
  const receipts = new Map()
  const controller = createDocumentDeliveryController({
    transport: {
      send: async delivery => {
        sent.push(delivery)
        return Object.freeze({
          deliveryReference: 'urn:delivery:opaque',
          deliveredAt: '2026-10-18T19:00:00.000Z',
        })
      },
    },
    receipts: {
      get: async operationId => receipts.get(operationId),
      put: async (operationId, record) => { receipts.set(operationId, record) },
    },
  })
  return {controller, sent, receipts}
}

test('delivers exact minimal PDF bytes once while keeping delivery, read and signature states distinct', async () => {
  const mediaObject = Object.freeze({
    ...SyntheticConfidentialDocumentFixture.attachment,
    contentSize: minimalPdfBytes.byteLength,
  })
  const input = request(Object.freeze({kind: 'inline', mediaObject, bytes: minimalPdfBytes}))
  const {controller, sent, receipts} = controllerFixture()

  const first = await controller.deliver(input)
  const replay = await controller.deliver(input)

  assert.deepEqual(replay, first)
  assert.equal(sent.length, 1)
  assert.deepEqual(first, {
    operationId: input.operationId,
    messageId: input.messageId,
    deliveryReference: 'urn:delivery:opaque',
    deliveredAt: '2026-10-18T19:00:00.000Z',
    deliveryStatus: 'delivered',
    readStatus: 'unread',
    signatureStatus: 'unsigned',
  })
  assert.equal(sent[0].documentGraph.data[0].type, 'DigitalDocument')
  assert.equal(sent[0].documentGraph.data[2].type, 'MediaObject')
  assert.equal(sent[0].attachments.length, 1)
  assert.deepEqual(
    Buffer.from(sent[0].attachments[0].data.base64, 'base64url'),
    Buffer.from(minimalPdfBytes),
  )
  assert.equal('DocumentReference' in sent[0], false)
  assert.equal(JSON.stringify(receipts.get(input.operationId)).includes('base64'), false)
})

test('delivers the canonical MediaObject through a protected DIDComm link', async () => {
  const input = request(Object.freeze({
    kind: 'linked',
    mediaObject: SyntheticConfidentialDocumentFixture.attachment,
  }))
  const {controller, sent} = controllerFixture()

  await controller.deliver(input)

  assert.deepEqual(sent[0].attachments[0].data.links, [
    SyntheticConfidentialDocumentFixture.attachment.contentUrl,
  ])
  assert.match(sent[0].attachments[0].data.hash, /^z[1-9A-HJ-NP-Za-km-z]+$/)
})

test('rejects byte-count drift and an operation replayed with a different message', async () => {
  const mediaObject = Object.freeze({
    ...SyntheticConfidentialDocumentFixture.attachment,
    contentSize: minimalPdfBytes.byteLength + 1,
  })
  const {controller} = controllerFixture()

  await assert.rejects(
    controller.deliver(request(Object.freeze({kind: 'inline', mediaObject, bytes: minimalPdfBytes}))),
    /byte count does not match/i,
  )

  const linked = request(Object.freeze({
    kind: 'linked',
    mediaObject: SyntheticConfidentialDocumentFixture.attachment,
  }))
  await controller.deliver(linked)
  await assert.rejects(controller.deliver({...linked, messageId: 'urn:message:different'}), /replay/i)
})

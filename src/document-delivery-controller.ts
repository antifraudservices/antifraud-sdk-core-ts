// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.

import {
  buildDidCommInlineBinaryAttachment,
  buildDidCommLinkedBinaryAttachment,
  buildSchemaOrgConfidentialDocumentGraph,
  type DidCommBinaryAttachment,
  type SchemaOrgDigitalDocumentDescriptor,
  type SchemaOrgEvidenceMediaAttachment,
} from 'antifraud-data-utils-ts'

export type TrustedDocumentDeliveryContext = Readonly<{
  senderReference: string
  recipientReference: string
  serviceReference: string
}>

export type DocumentDeliveryAttachmentInput =
  | Readonly<{
      kind: 'inline'
      mediaObject: SchemaOrgEvidenceMediaAttachment
      bytes: Uint8Array
    }>
  | Readonly<{
      kind: 'linked'
      mediaObject: SchemaOrgEvidenceMediaAttachment
    }>

export type DocumentDeliveryRequest = Readonly<{
  operationId: string
  messageId: string
  trustedContext: TrustedDocumentDeliveryContext
  manifest: SchemaOrgDigitalDocumentDescriptor
  document: SchemaOrgDigitalDocumentDescriptor
  attachment: DocumentDeliveryAttachmentInput
}>

export type PreparedDocumentDelivery = Readonly<{
  operationId: string
  messageId: string
  trustedContext: TrustedDocumentDeliveryContext
  documentGraph: ReturnType<typeof buildSchemaOrgConfidentialDocumentGraph>
  attachments: readonly [DidCommBinaryAttachment]
}>

export type DocumentDeliveryReceipt = Readonly<{
  operationId: string
  messageId: string
  deliveryReference: string
  deliveredAt: string
  deliveryStatus: 'delivered'
  readStatus: 'unread'
  signatureStatus: 'unsigned'
}>

type DocumentDeliveryContinuity = Readonly<{
  messageId: string
  senderReference: string
  recipientReference: string
  contentId: string
  receipt: DocumentDeliveryReceipt
}>

export type DocumentDeliveryControllerPorts = Readonly<{
  transport: Readonly<{
    send(delivery: PreparedDocumentDelivery): Promise<Readonly<{
      deliveryReference: string
      deliveredAt: string
    }>>
  }>
  receipts: Readonly<{
    get(operationId: string): Promise<DocumentDeliveryContinuity | undefined>
    put(operationId: string, record: DocumentDeliveryContinuity): Promise<void>
  }>
}>

function requireNonEmpty(value: string, path: string): string {
  const normalized = value.trim()
  if (!normalized) throw new TypeError(`${path} must not be empty`)
  return normalized
}

function prepareDocumentDelivery(request: DocumentDeliveryRequest): PreparedDocumentDelivery {
  const operationId = requireNonEmpty(request.operationId, 'operationId')
  const messageId = requireNonEmpty(request.messageId, 'messageId')
  const trustedContext = Object.freeze({
    senderReference: requireNonEmpty(request.trustedContext.senderReference, 'senderReference'),
    recipientReference: requireNonEmpty(request.trustedContext.recipientReference, 'recipientReference'),
    serviceReference: requireNonEmpty(request.trustedContext.serviceReference, 'serviceReference'),
  })
  const documentGraph = buildSchemaOrgConfidentialDocumentGraph({
    manifest: request.manifest,
    documents: [{...request.document, attachment: request.attachment.mediaObject}],
  })

  const attachment = request.attachment.kind === 'inline'
    ? buildDidCommInlineBinaryAttachment({
        id: request.attachment.mediaObject.id,
        mediaType: request.attachment.mediaObject.mediaType,
        bytes: request.attachment.bytes,
      })
    : buildDidCommLinkedBinaryAttachment(request.attachment.mediaObject)

  if (attachment.byte_count !== request.attachment.mediaObject.contentSize) {
    throw new TypeError('DIDComm attachment byte count does not match the Schema.org MediaObject')
  }

  return Object.freeze({
    operationId,
    messageId,
    trustedContext,
    documentGraph,
    attachments: Object.freeze([attachment]) as readonly [DidCommBinaryAttachment],
  })
}

function isSameOperation(
  current: DocumentDeliveryContinuity,
  prepared: PreparedDocumentDelivery,
  contentId: string,
): boolean {
  return current.messageId === prepared.messageId
    && current.senderReference === prepared.trustedContext.senderReference
    && current.recipientReference === prepared.trustedContext.recipientReference
    && current.contentId === contentId
}

export function createDocumentDeliveryController(ports: DocumentDeliveryControllerPorts) {
  return Object.freeze({
    async deliver(request: DocumentDeliveryRequest): Promise<DocumentDeliveryReceipt> {
      const prepared = prepareDocumentDelivery(request)
      const contentId = request.attachment.mediaObject.contentId
      const current = await ports.receipts.get(prepared.operationId)
      if (current) {
        if (!isSameOperation(current, prepared, contentId)) {
          throw new Error('Document delivery operation replay does not match the original request')
        }
        return current.receipt
      }

      const delivered = await ports.transport.send(prepared)
      const receipt = Object.freeze({
        operationId: prepared.operationId,
        messageId: prepared.messageId,
        deliveryReference: requireNonEmpty(delivered.deliveryReference, 'deliveryReference'),
        deliveredAt: requireNonEmpty(delivered.deliveredAt, 'deliveredAt'),
        deliveryStatus: 'delivered' as const,
        readStatus: 'unread' as const,
        signatureStatus: 'unsigned' as const,
      })
      await ports.receipts.put(prepared.operationId, Object.freeze({
        messageId: prepared.messageId,
        senderReference: prepared.trustedContext.senderReference,
        recipientReference: prepared.trustedContext.recipientReference,
        contentId,
        receipt,
      }))
      return receipt
    },
  })
}

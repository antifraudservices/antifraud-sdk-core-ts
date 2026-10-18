import {
  CredentialIssuanceStatus,
  defineCredentialIssuanceRequest,
  type CredentialIssuanceReceipt,
  type CredentialIssuanceRequest,
} from 'antifraud-data-utils-ts'

export interface CredentialIssuanceProviderPort {
  requestIssuance(request: CredentialIssuanceRequest): Promise<CredentialIssuanceReceipt>
  getIssuance(issuanceId: string): Promise<CredentialIssuanceReceipt>
}

export interface CredentialIssuanceControllerOptions {
  provider: CredentialIssuanceProviderPort
  wait(milliseconds: number): Promise<void>
}

export interface CredentialIssuancePollingOptions {
  maxPollAttempts?: number
  pollIntervalMilliseconds?: number
}

export interface CredentialIssuanceController {
  issue(
    request: CredentialIssuanceRequest & Record<string, unknown>,
    polling?: CredentialIssuancePollingOptions,
  ): Promise<CredentialIssuanceReceipt>
}

function isTerminal(receipt: CredentialIssuanceReceipt): boolean {
  return receipt.status === CredentialIssuanceStatus.Issued
    || receipt.status === CredentialIssuanceStatus.Denied
    || receipt.status === CredentialIssuanceStatus.Failed
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`)
  }
  return resolved
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new TypeError('pollIntervalMilliseconds must be a non-negative safe integer')
  }
  return resolved
}

export function createCredentialIssuanceController(
  options: CredentialIssuanceControllerOptions,
): CredentialIssuanceController {
  return Object.freeze({
    async issue(
      request: CredentialIssuanceRequest & Record<string, unknown>,
      polling: CredentialIssuancePollingOptions = {},
    ) {
      const canonicalRequest = defineCredentialIssuanceRequest(request)
      const initial = await options.provider.requestIssuance(canonicalRequest)
      if (isTerminal(initial)) return initial

      const maxPollAttempts = positiveInteger(
        polling.maxPollAttempts,
        8,
        'maxPollAttempts',
      )
      const pollIntervalMilliseconds = nonNegativeInteger(
        polling.pollIntervalMilliseconds,
        1_000,
      )

      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        await options.wait(pollIntervalMilliseconds)
        const current = await options.provider.getIssuance(initial.issuanceId)
        if (current.issuanceId !== initial.issuanceId) {
          throw new Error('Credential provider changed issuance identifier during polling')
        }
        if (isTerminal(current)) return current
      }

      throw new Error('Credential issuance remained pending after the configured poll limit')
    },
  })
}

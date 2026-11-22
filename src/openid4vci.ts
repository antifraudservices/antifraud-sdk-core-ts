const offerScheme = 'openid-credential-offer:'
const offerReferenceParameter = 'credential_offer_uri'

function trustedHttpsUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new TypeError('Expected an HTTPS URL without credentials or a fragment')
  }
  return url
}

function validateReference(reference: string, trustedOfferOrigin: string): string {
  const url = trustedHttpsUrl(reference)
  if (url.origin !== trustedHttpsUrl(trustedOfferOrigin).origin) {
    throw new TypeError('Credential offer does not use the trusted origin')
  }
  return url.href
}

/** Constructs the wallet launch URI for a server-hosted OpenID4VCI offer. */
export function buildOpenId4VciOfferReference(reference: string, trustedOfferOrigin: string): string {
  const parameters = new URLSearchParams()
  parameters.set(offerReferenceParameter, validateReference(reference, trustedOfferOrigin))
  return `${offerScheme}//?${parameters}`
}

/** Reads one by-reference offer without fetching it or accepting an inline grant. */
export function readOpenId4VciOfferReference(launchUri: string, trustedOfferOrigin: string): string {
  const url = new URL(launchUri)
  if (url.protocol !== offerScheme || url.host || url.pathname || url.hash || url.username || url.password) {
    throw new TypeError('Invalid OpenID4VCI offer launch URI')
  }
  const parameters = [...url.searchParams]
  const entry = parameters[0]
  if (parameters.length !== 1 || !entry || entry[0] !== offerReferenceParameter || !entry[1]) {
    throw new TypeError('Expected exactly one reference in the credential offer URI')
  }
  return validateReference(entry[1], trustedOfferOrigin)
}

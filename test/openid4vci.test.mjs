// Flow contract: web and native clients can open the same by-reference credential offer over a trusted issuer origin.
import assert from 'node:assert/strict'
import test from 'node:test'
import * as core from '../dist/index.js'

const issuer = 'https://issuer.example'
const offer = new URL('/credential-offers/synthetic-reference', issuer).href

test('round-trips a by-reference OpenID4VCI offer without embedding its grant', () => {
  const launch = core.buildOpenId4VciOfferReference(offer, issuer)
  const url = new URL(launch)
  assert.equal(url.protocol, 'openid-credential-offer:')
  assert.deepEqual([...url.searchParams], [['credential_offer_uri', offer]])
  assert.equal(core.readOpenId4VciOfferReference(launch, issuer), offer)
})

test('rejects references outside the trusted HTTPS issuer and ambiguous offers', () => {
  assert.throws(() => core.buildOpenId4VciOfferReference(offer.replace('https:', 'http:'), issuer), /HTTPS/)
  assert.throws(() => core.buildOpenId4VciOfferReference(offer.replace('issuer.example', 'other.example'), issuer), /trusted origin/)
  const launch = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(offer)}`
  assert.throws(() => core.readOpenId4VciOfferReference(`${launch}&credential_offer=%7B%7D`, issuer), /one reference/)
  assert.throws(() => core.readOpenId4VciOfferReference(`${launch}&credential_offer_uri=${encodeURIComponent(offer)}`, issuer), /one reference/)
})

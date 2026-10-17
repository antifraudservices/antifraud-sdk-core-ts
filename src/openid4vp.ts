export const OPENID4VP_FORMAT = {
  msoMdoc: 'mso_mdoc',
  sdJwtVc: 'dc+sd-jwt',
} as const

export const EUDI_PID = {
  mdocType: 'eu.europa.ec.eudi.pid.1',
  sdJwtVcType: 'urn:eudi:pid:1',
  givenName: 'given_name',
  familyName: 'family_name',
  birthDate: 'birth_date',
} as const

export const ISO_MDL = {
  documentType: 'org.iso.18013.5.1.mDL',
  namespace: 'org.iso.18013.5.1',
  givenName: 'given_name',
  familyName: 'family_name',
  birthDate: 'birth_date',
} as const

export type OpenId4VpProfileId = 'eudi-pid' | 'mdl'

export interface OpenId4VpProfile {
  id: OpenId4VpProfileId
  label: string
  claimLabels: readonly string[]
}

export const OPENID4VP_PROFILES = {
  eudiPid: {
    id: 'eudi-pid',
    label: 'EUDI Personal Identification Data',
    claimLabels: ['Given name', 'Family name', 'Date of birth'],
  },
  mobileDrivingLicence: {
    id: 'mdl',
    label: 'Mobile Driving Licence',
    claimLabels: ['Given name', 'Family name', 'Date of birth'],
  },
} as const satisfies Record<string, OpenId4VpProfile>

export interface DcqlClaim {
  path: readonly string[]
  intent_to_retain?: false
}

export interface DcqlCredential {
  id: string
  format: (typeof OPENID4VP_FORMAT)[keyof typeof OPENID4VP_FORMAT]
  meta: { doctype_value: string } | { vct_values: readonly string[] }
  claims: readonly DcqlClaim[]
}

export interface DcqlQuery {
  credentials: readonly DcqlCredential[]
  credential_sets?: readonly { options: readonly (readonly string[])[] }[]
}

function mdocClaim(namespace: string, claim: string): DcqlClaim {
  return { path: [namespace, claim], intent_to_retain: false }
}

export function buildDcqlQuery(profile: OpenId4VpProfile): DcqlQuery {
  if (profile.id === 'eudi-pid') {
    return {
      credentials: [
        {
          id: 'pid_mdoc',
          format: OPENID4VP_FORMAT.msoMdoc,
          meta: { doctype_value: EUDI_PID.mdocType },
          claims: [
            mdocClaim(EUDI_PID.mdocType, EUDI_PID.givenName),
            mdocClaim(EUDI_PID.mdocType, EUDI_PID.familyName),
            mdocClaim(EUDI_PID.mdocType, EUDI_PID.birthDate),
          ],
        },
        {
          id: 'pid_sd_jwt',
          format: OPENID4VP_FORMAT.sdJwtVc,
          meta: { vct_values: [EUDI_PID.sdJwtVcType] },
          claims: [
            { path: [EUDI_PID.givenName] },
            { path: [EUDI_PID.familyName] },
            { path: [EUDI_PID.birthDate] },
          ],
        },
      ],
      credential_sets: [{ options: [['pid_mdoc'], ['pid_sd_jwt']] }],
    }
  }

  return {
    credentials: [
      {
        id: 'mdl',
        format: OPENID4VP_FORMAT.msoMdoc,
        meta: { doctype_value: ISO_MDL.documentType },
        claims: [
          mdocClaim(ISO_MDL.namespace, ISO_MDL.givenName),
          mdocClaim(ISO_MDL.namespace, ISO_MDL.familyName),
          mdocClaim(ISO_MDL.namespace, ISO_MDL.birthDate),
        ],
      },
    ],
  }
}


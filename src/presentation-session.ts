export interface PresentationSessionStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export interface PresentationSession {
  transactionId: string
  requestUri: string
  createdAt: string
}

const SESSION_KEY = 'openid4vp.presentation.session'

function isPresentationSession(value: unknown): value is PresentationSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.transactionId === 'string'
    && typeof candidate.requestUri === 'string'
    && typeof candidate.createdAt === 'string'
    && Object.keys(candidate).every((key) => (
      key === 'transactionId' || key === 'requestUri' || key === 'createdAt'
    ))
}

export function createPresentationSessionRepository(storage: PresentationSessionStorage) {
  return {
    async load(): Promise<PresentationSession | null> {
      const serialized = await storage.getItem(SESSION_KEY)
      if (!serialized) return null
      try {
        const value: unknown = JSON.parse(serialized)
        return isPresentationSession(value) ? value : null
      } catch {
        return null
      }
    },
    async save(session: PresentationSession): Promise<void> {
      await storage.setItem(SESSION_KEY, JSON.stringify(session))
    },
    async clear(): Promise<void> {
      await storage.removeItem(SESSION_KEY)
    },
  }
}


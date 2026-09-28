import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose'
import type { PrismaService } from '@/prisma/prisma.service'
import { UniauthLogoutService } from './uniauth-logout.service'

const issuer = 'http://auth.test/api/auth'
const clientId = 'unishare-client'

jest.mock('@/auth/auth-mode', () => ({
  uniauthConfig: {
    issuer: 'http://auth.test/api/auth',
    clientId: 'unishare-client',
    clientSecret: 's',
  },
}))

const LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout'

describe('UniauthLogoutService', () => {
  let privateKey: CryptoKey
  const realFetch = global.fetch
  let prisma: { account: { findFirst: jest.Mock }; session: { deleteMany: jest.Mock } }
  let service: UniauthLogoutService

  beforeAll(async () => {
    const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
    privateKey = pair.privateKey
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'EdDSA' }
    global.fetch = jest.fn(async () => Response.json({ keys: [jwk] })) as typeof fetch
  })

  afterAll(() => {
    global.fetch = realFetch
  })

  beforeEach(() => {
    prisma = {
      account: { findFirst: jest.fn().mockResolvedValue({ userId: 'local-1' }) },
      session: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    }
    service = new UniauthLogoutService(prisma as unknown as PrismaService)
  })

  function logoutToken(claims: Record<string, unknown> = {}, opts: { aud?: string } = {}) {
    return new SignJWT({ events: { [LOGOUT_EVENT]: {} }, ...claims })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1', typ: 'logout+jwt' })
      .setIssuer(issuer)
      .setAudience(opts.aud ?? clientId)
      .setSubject('ua_1')
      .setIssuedAt()
      .setJti('jti-1')
      .sign(privateKey)
  }

  it('ends every unishare session of the user', async () => {
    await expect(service.handle(await logoutToken())).resolves.toBe(true)
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'local-1' } })
  })

  it('accepts but does nothing for someone who never signed in to unishare', async () => {
    prisma.account.findFirst.mockResolvedValue(null)
    await expect(service.handle(await logoutToken())).resolves.toBe(true)
    expect(prisma.session.deleteMany).not.toHaveBeenCalled()
  })

  it('rejects a token for another client, with a nonce, or without the logout event', async () => {
    await expect(service.handle(await logoutToken({}, { aud: 'unigym' }))).resolves.toBe(false)
    await expect(service.handle(await logoutToken({ nonce: 'n' }))).resolves.toBe(false)
    await expect(service.handle(await logoutToken({ events: {} }))).resolves.toBe(false)
    await expect(service.handle('not-a-jwt')).resolves.toBe(false)
    expect(prisma.session.deleteMany).not.toHaveBeenCalled()
  })
})

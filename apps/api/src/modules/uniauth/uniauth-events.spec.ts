import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose'
import type { PrismaService } from '@/prisma/prisma.service'
import { UniauthLogoutService } from './uniauth-logout.service'
import { UniauthUserDeletedService } from './uniauth-user-deleted.service'
import { LOGOUT_EVENT, USER_DELETED_EVENT } from './uniauth-event-token'

const issuer = 'http://auth.test/api/auth'
const clientId = 'unishare-client'

jest.mock('@/auth/uniauth-config', () => ({
  uniauthConfig: { issuer: 'http://auth.test/api/auth', clientId: 'unishare-client' },
}))

const mockInternalAdapter = {
  deleteUserSessions: jest.fn(),
  deleteAccounts: jest.fn(),
  deleteUser: jest.fn(),
}
jest.mock('@/auth/auth.config', () => ({
  auth: {
    get $context() {
      return Promise.resolve({ internalAdapter: mockInternalAdapter })
    },
  },
}))

describe('uniauth event callbacks', () => {
  let privateKey: CryptoKey
  const realFetch = global.fetch
  let prisma: { account: { findFirst: jest.Mock }; session: { deleteMany: jest.Mock } }
  let logout: UniauthLogoutService
  let userDeleted: UniauthUserDeletedService

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
    jest.clearAllMocks()
    prisma = {
      account: { findFirst: jest.fn().mockResolvedValue({ userId: 'local-1' }) },
      session: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    }
    logout = new UniauthLogoutService(prisma as unknown as PrismaService)
    userDeleted = new UniauthUserDeletedService(prisma as unknown as PrismaService)
  })

  function token(event: string, claims: Record<string, unknown> = {}, opts: { aud?: string } = {}) {
    return new SignJWT({ events: { [event]: {} }, ...claims })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setIssuer(issuer)
      .setAudience(opts.aud ?? clientId)
      .setSubject('ua_1')
      .setIssuedAt()
      .setExpirationTime('2m')
      .setJti('jti-1')
      .sign(privateKey)
  }

  describe('back-channel logout', () => {
    it('ends every unishare session of the user', async () => {
      await expect(logout.handle(await token(LOGOUT_EVENT))).resolves.toBe(true)
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'local-1' } })
    })

    it('accepts but does nothing for someone who never signed in to unishare', async () => {
      prisma.account.findFirst.mockResolvedValue(null)
      await expect(logout.handle(await token(LOGOUT_EVENT))).resolves.toBe(true)
      expect(prisma.session.deleteMany).not.toHaveBeenCalled()
    })

    it('rejects a token for another client, with a nonce, or without the logout event', async () => {
      await expect(logout.handle(await token(LOGOUT_EVENT, {}, { aud: 'unigym' }))).resolves.toBe(
        false,
      )
      await expect(logout.handle(await token(LOGOUT_EVENT, { nonce: 'n' }))).resolves.toBe(false)
      await expect(logout.handle(await token(LOGOUT_EVENT, { events: {} }))).resolves.toBe(false)
      await expect(logout.handle('not-a-jwt')).resolves.toBe(false)
      expect(prisma.session.deleteMany).not.toHaveBeenCalled()
    })

    it('does not treat a deletion notice as a logout', async () => {
      await expect(logout.handle(await token(USER_DELETED_EVENT))).resolves.toBe(false)
    })
  })

  describe('account deleted in uniauth', () => {
    it("deletes the user's sessions, accounts and data", async () => {
      await expect(userDeleted.handle(await token(USER_DELETED_EVENT))).resolves.toBe(true)
      expect(prisma.account.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { providerId: 'uniauth', accountId: 'ua_1' } }),
      )
      expect(mockInternalAdapter.deleteUserSessions).toHaveBeenCalledWith('local-1')
      expect(mockInternalAdapter.deleteAccounts).toHaveBeenCalledWith('local-1')
      expect(mockInternalAdapter.deleteUser).toHaveBeenCalledWith('local-1')
    })

    it('accepts but does nothing for someone who never used unishare', async () => {
      prisma.account.findFirst.mockResolvedValue(null)
      await expect(userDeleted.handle(await token(USER_DELETED_EVENT))).resolves.toBe(true)
      expect(mockInternalAdapter.deleteUser).not.toHaveBeenCalled()
    })

    it('never deletes on a logout token, a mixed token, or one for another app', async () => {
      await expect(userDeleted.handle(await token(LOGOUT_EVENT))).resolves.toBe(false)
      await expect(
        userDeleted.handle(
          await token(USER_DELETED_EVENT, {
            events: { [USER_DELETED_EVENT]: {}, [LOGOUT_EVENT]: {} },
          }),
        ),
      ).resolves.toBe(false)
      await expect(
        userDeleted.handle(await token(USER_DELETED_EVENT, {}, { aud: 'unigym' })),
      ).resolves.toBe(false)
      await expect(
        userDeleted.handle(await token(USER_DELETED_EVENT, { nonce: 'n' })),
      ).resolves.toBe(false)
      expect(mockInternalAdapter.deleteUser).not.toHaveBeenCalled()
    })
  })
})

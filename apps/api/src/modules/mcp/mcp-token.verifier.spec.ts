import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose'

const issuer = 'http://auth.test/api/auth'
const resource = 'http://share.test/mcp'

type Verifier = typeof import('./mcp-token.verifier')

// The verifier reads its env at import time, so each test loads a fresh copy.
function loadVerifier(env: Record<string, string | undefined>): Verifier {
  Object.assign(process.env, env)
  let mod!: Verifier
  jest.isolateModules(() => {
    mod = jest.requireActual('./mcp-token.verifier')
  })
  return mod
}

describe('mcp-token.verifier', () => {
  let privateKey: CryptoKey
  const realFetch = global.fetch

  beforeAll(async () => {
    const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
    privateKey = pair.privateKey
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'EdDSA' }
    global.fetch = jest.fn(async () => Response.json({ keys: [jwk] })) as typeof fetch
  })

  afterAll(() => {
    global.fetch = realFetch
    delete process.env.MCP_AUTH_ISSUER
    delete process.env.FRONTEND_URL
  })

  function sign(claims: Record<string, unknown>, opts: { iss?: string; aud?: string } = {}) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setIssuer(opts.iss ?? issuer)
      .setAudience(opts.aud ?? resource)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey)
  }

  describe('with MCP_AUTH_ISSUER set', () => {
    const verifier = () =>
      loadVerifier({ MCP_AUTH_ISSUER: issuer, FRONTEND_URL: 'http://share.test' })

    it('returns the session for a valid uniauth token', async () => {
      const token = await sign({ sub: 'user-1', scope: 'boards:read posts:read' })
      await expect(verifier().verifyMcpAccessToken(token)).resolves.toEqual({
        userId: 'user-1',
        scopes: 'boards:read posts:read',
      })
    })

    it('rejects a token issued for another resource', async () => {
      const token = await sign({ sub: 'user-1' }, { aud: 'http://other.test/mcp' })
      await expect(verifier().verifyMcpAccessToken(token)).resolves.toBeNull()
    })

    it('rejects a token from another issuer', async () => {
      const token = await sign({ sub: 'user-1' }, { iss: 'http://evil.test' })
      await expect(verifier().verifyMcpAccessToken(token)).resolves.toBeNull()
    })

    it('rejects a tampered or malformed token', async () => {
      const token = await sign({ sub: 'user-1' })
      await expect(verifier().verifyMcpAccessToken(`${token.slice(0, -2)}xx`)).resolves.toBeNull()
      await expect(verifier().verifyMcpAccessToken('not-a-jwt')).resolves.toBeNull()
    })

    it('publishes uniauth as the authorization server', () => {
      expect(verifier().protectedResourceMetadata(['boards:read'])).toEqual({
        resource,
        authorization_servers: [issuer],
        scopes_supported: ['boards:read'],
        bearer_methods_supported: ['header'],
      })
    })
  })

  it('verifies nothing when MCP_AUTH_ISSUER is unset (legacy mode)', async () => {
    const token = await sign({ sub: 'user-1' })
    const verifier = loadVerifier({ MCP_AUTH_ISSUER: '', FRONTEND_URL: 'http://share.test' })
    expect(verifier.mcpAuthIssuer).toBeUndefined()
    await expect(verifier.verifyMcpAccessToken(token)).resolves.toBeNull()
  })

  it('extracts bearer tokens only', () => {
    const { bearerToken } = loadVerifier({})
    expect(bearerToken('Bearer abc.def')).toBe('abc.def')
    expect(bearerToken('bearer abc')).toBe('abc')
    expect(bearerToken('Basic abc')).toBeNull()
    expect(bearerToken(undefined)).toBeNull()
  })
})

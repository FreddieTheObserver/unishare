import { ExecutionContext } from '@nestjs/common'
import { verifyMcpAccessToken, resolveLocalUserId } from '@/modules/mcp/mcp-token.verifier'
import { McpAuthGuard } from './mcp-auth.guard'

jest.mock('@/modules/mcp/mcp-token.verifier', () => ({
  ...jest.requireActual('@/modules/mcp/mcp-token.verifier'),
  verifyMcpAccessToken: jest.fn(),
  resolveLocalUserId: jest.fn(),
}))

function contextFor(req: Record<string, unknown>, res: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext
}

describe('McpAuthGuard', () => {
  const guard = new McpAuthGuard({} as never)
  const verify = verifyMcpAccessToken as jest.Mock
  const resolve = resolveLocalUserId as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('attaches the local user’s session to the request and allows the call through', async () => {
    verify.mockResolvedValue({ userId: 'ua_1', scopes: 'openid posts:write' })
    resolve.mockResolvedValue('user-1')
    const req: Record<string, unknown> = { headers: { authorization: 'Bearer abc' } }

    const result = await guard.canActivate(contextFor(req, {}))

    expect(result).toBe(true)
    expect(verify).toHaveBeenCalledWith('abc')
    expect(req.mcpSession).toEqual({ userId: 'user-1', scopes: 'openid posts:write' })
  })

  it('rejects with a JSON-RPC 401 and does not attach a session when unauthenticated', async () => {
    verify.mockResolvedValue(null)
    const req: Record<string, unknown> = { headers: {} }
    const set = jest.fn().mockReturnThis()
    const json = jest.fn().mockReturnThis()
    const status = jest.fn().mockReturnValue({ set, json })

    const result = await guard.canActivate(contextFor(req, { status }))

    expect(result).toBe(false)
    expect(req.mcpSession).toBeUndefined()
    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Authentication required' },
      }),
    )
  })
})

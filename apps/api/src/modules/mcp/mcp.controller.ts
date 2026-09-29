import { All, Controller, Get, Logger, Req, Res, UseFilters, UseGuards } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { OptionalAuth } from '@thallesp/nestjs-better-auth'
import { Throttle } from '@nestjs/throttler'
import type { Response } from 'express'
import { McpExceptionFilter } from '@/common/filters/mcp-exception.filter'
import { McpAuthGuard, type RequestWithMcpSession } from '@/common/guards/mcp-auth.guard'
import { UserThrottlerGuard } from '@/common/guards/user-throttler.guard'
import { McpService } from './mcp.service'
import { protectedResourceMetadata } from './mcp-token.verifier'

@ApiExcludeController()
@OptionalAuth()
@UseFilters(McpExceptionFilter)
@Controller()
export class McpController {
  private readonly logger = new Logger(McpController.name)

  constructor(private readonly mcpService: McpService) {}

  // unishare is only the resource server. Clients find the authorization server (uniauth)
  // through the protected-resource metadata.
  @Get(['.well-known/oauth-protected-resource', '.well-known/oauth-protected-resource/mcp'])
  protectedResource(@Res() res: Response) {
    return res.json(protectedResourceMetadata())
  }

  @All('mcp')
  @UseGuards(McpAuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async handle(@Req() req: RequestWithMcpSession, @Res() res: Response) {
    try {
      await this.mcpService.handleRequest(req, res, req.mcpSession!, req.body)
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : 'MCP request failed')
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        })
      }
    }
  }
}

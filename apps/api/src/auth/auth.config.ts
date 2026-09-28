import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { openAPI, admin, anonymous, mcp, genericOAuth } from 'better-auth/plugins'
import { generateGuestDisplayName } from './guest-display-name'
import { ac, roles } from '../lib/permissions'
import { UserRole } from '../generated/prisma/client'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { isUniauthMode, uniauthConfig, UNIAUTH_PROVIDER_ID } from './auth-mode'
import { mapUniauthProfile } from './uniauth-sign-in'

const isProduction = process.env.NODE_ENV === 'production'
export const isMcpEnabled = process.env.MCP_ENABLED === 'true'

if (isProduction) {
  const required = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'FRONTEND_URL']
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable in production: ${key}`)
    }
  }
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL as string,
})

const prisma = new PrismaClient({ adapter })

const trustedOrigins = [
  'http://localhost:3000',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
]

export const mcpScopes = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'boards:read',
  'boards:write',
  'posts:read',
  'posts:write',
  'courses:read',
]

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // genericOAuth (1.6) sends provider errors — including login_required from the silent
  // prompt=none check — here before reading the sign-in's errorCallbackURL. The web page
  // sends login_required back to where the visitor was and other errors to /login.
  ...(isUniauthMode && {
    onAPIError: {
      errorURL: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/auth/return`,
    },
  }),
  advanced: {
    crossSubDomainCookies: {
      enabled: isProduction,
      domain: process.env.COOKIE_DOMAIN,
    },
  },
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  // uniauth mode: passwords and Google/Microsoft live only in uniauth; unishare signs users
  // in through the `uniauth` OIDC provider below and keeps just its own session.
  emailAndPassword: {
    enabled: !isUniauthMode,
  },
  account: {
    accountLinking: {
      allowDifferentEmails: true,
    },
  },
  socialProviders: isUniauthMode
    ? {}
    : {
        microsoft: {
          clientId: process.env.MICROSOFT_CLIENT_ID as string,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
          tenantId: process.env.MICROSOFT_TENANT_ID ?? 'common',
        },
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      },
  plugins: [
    ...(uniauthConfig
      ? [
          genericOAuth({
            config: [
              {
                providerId: UNIAUTH_PROVIDER_ID,
                discoveryUrl: `${uniauthConfig.issuer}/.well-known/openid-configuration`,
                clientId: uniauthConfig.clientId,
                clientSecret: uniauthConfig.clientSecret,
                authentication: 'basic',
                pkce: true,
                scopes: ['openid', 'profile', 'email', 'offline_access'],
                // Name, avatar and university are uniauth's: refreshed on every sign-in.
                overrideUserInfo: true,
                mapProfileToUser: mapUniauthProfile(prisma),
                // The web app's silent check signs in with additionalData.prompt = 'none':
                // uniauth answers instantly (signed in) or with login_required.
                authorizationUrlParams: (ctx): Record<string, string> =>
                  (ctx.body as { additionalData?: { prompt?: string } } | undefined)?.additionalData
                    ?.prompt === 'none'
                    ? { prompt: 'none' }
                    : {},
              },
            ],
          }),
        ]
      : []),
    admin({
      ac,
      roles,
      defaultRole: UserRole.STUDENT,
      adminRoles: [UserRole.ADMIN],
    }),
    anonymous({
      emailDomainName: 'guest.unishare.app',
      generateName: () => generateGuestDisplayName(),
    }),
    // In uniauth mode uniauth is the MCP authorization server (see mcp-token.verifier.ts).
    ...(isMcpEnabled && !isUniauthMode
      ? [
          mcp({
            loginPage: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login`,
            resource: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/mcp`,
            // Better Auth 1.6 reads provider metadata from the top level at runtime.
            metadata: { scopes_supported: mcpScopes },
            oidcConfig: {
              loginPage: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login`,
              scopes: ['boards:read', 'boards:write', 'posts:read', 'posts:write', 'courses:read'],
              metadata: { scopes_supported: mcpScopes },
              allowPlainCodeChallengeMethod: false,
              allowDynamicClientRegistration: true,
            },
          } as Parameters<typeof mcp>[0] & { metadata: { scopes_supported: string[] } }),
        ]
      : []),
    ...(isProduction ? [] : [openAPI()]),
  ],
  trustedOrigins,
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAgeUnitInMilliseconds: 60 * 60 * 1000,
    additionalFields: {
      displayName: {
        type: 'string' as const,
        required: false,
        input: false,
        returned: true,
      },
      isViewOnly: {
        type: 'boolean' as const,
        required: false,
        defaultValue: false,
        input: false,
        returned: true,
      },
    },
  },
  user: {
    deleteUser: {
      enabled: true,
    },
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'STUDENT',
        input: false,
        returned: true,
      },
      departmentId: {
        type: 'string',
        required: false,
        input: false,
        returned: true,
      },
      universityId: {
        type: 'string',
        required: false,
        input: true,
        returned: true,
      },
      consentGivenAt: {
        type: 'date',
        required: false,
        input: false,
        returned: true,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Consent timestamp is always set server-side for all signup flows
        // (both OAuth and email/password). This ensures it's never missing.
        after: async (user) => {
          if (!user.consentGivenAt) {
            await prisma.user.update({
              where: { id: user.id },
              data: { consentGivenAt: new Date() },
            })
          }
        },
      },
    },
  },
})

export type Auth = typeof auth
export type UserSession = typeof auth.$Infer.Session

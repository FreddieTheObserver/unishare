import type { PrismaClient } from '../generated/prisma/client'

/** uniauth puts university memberships here (ID token + userinfo). */
export const ORGANIZATIONS_CLAIM = 'urn:uniauth:organizations'

interface UniauthProfile {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  picture?: string | null
  [ORGANIZATIONS_CLAIM]?: { id: string; verified: boolean }[]
}

/**
 * Maps uniauth's userinfo onto the local user on every sign-in (overrideUserInfo): name
 * and avatar are always uniauth's, and the university follows the uniauth membership
 * (verified first). A user with no mapped membership keeps whatever university they have.
 */
export function mapUniauthProfile(prisma: PrismaClient) {
  return async (raw: Record<string, unknown>) => {
    const profile = raw as unknown as UniauthProfile
    const universityId = await universityForMemberships(prisma, profile[ORGANIZATIONS_CLAIM] ?? [])
    // No id: the local user is matched through the account row (accountId = sub), never by id.
    return {
      email: profile.email,
      emailVerified: profile.email_verified === true,
      name: profile.name || profile.email,
      image: profile.picture ?? undefined,
      ...(universityId && { universityId }),
    }
  }
}

export async function universityForMemberships(
  prisma: PrismaClient,
  memberships: { id: string; verified: boolean }[],
): Promise<string | null> {
  if (!memberships.length) return null
  const ordered = [...memberships].sort((a, b) => +b.verified - +a.verified)
  const universities = await prisma.university.findMany({
    where: { uniauthOrgId: { in: ordered.map((m) => m.id) } },
    select: { id: true, uniauthOrgId: true },
  })
  for (const m of ordered) {
    const match = universities.find((u) => u.uniauthOrgId === m.id)
    if (match) return match.id
  }
  return null
}

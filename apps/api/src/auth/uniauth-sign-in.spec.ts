import type { PrismaClient } from '../generated/prisma/client'
import { mapUniauthProfile, ORGANIZATIONS_CLAIM } from './uniauth-sign-in'

function prismaWith(universities: { id: string; uniauthOrgId: string }[]) {
  return {
    university: { findMany: jest.fn().mockResolvedValue(universities) },
  } as unknown as PrismaClient
}

const profile = (extra: Record<string, unknown> = {}) => ({
  sub: 'ua_1',
  email: 'ada@kmutt.ac.th',
  email_verified: true,
  name: 'Ada',
  picture: 'https://img/ada.png',
  ...extra,
})

describe('mapUniauthProfile', () => {
  it('maps identity fields from uniauth', async () => {
    const map = mapUniauthProfile(prismaWith([]))
    await expect(map(profile())).resolves.toEqual({
      id: 'ua_1',
      email: 'ada@kmutt.ac.th',
      emailVerified: true,
      name: 'Ada',
      image: 'https://img/ada.png',
    })
  })

  it('prefers a verified membership when choosing the university', async () => {
    const map = mapUniauthProfile(
      prismaWith([
        { id: 'uni_picked', uniauthOrgId: 'org_picked' },
        { id: 'uni_kmutt', uniauthOrgId: 'org_kmutt' },
      ]),
    )
    const mapped = await map(
      profile({
        [ORGANIZATIONS_CLAIM]: [
          { id: 'org_picked', verified: false },
          { id: 'org_kmutt', verified: true },
        ],
      }),
    )
    expect(mapped).toMatchObject({ universityId: 'uni_kmutt' })
  })

  it('leaves the university untouched when no membership maps to one', async () => {
    const map = mapUniauthProfile(prismaWith([]))
    const mapped = await map(profile({ [ORGANIZATIONS_CLAIM]: [{ id: 'org_x', verified: true }] }))
    expect(mapped).not.toHaveProperty('universityId')
  })

  it('treats a missing email_verified as unverified and falls back to the email for a name', async () => {
    const map = mapUniauthProfile(prismaWith([]))
    const mapped = await map(profile({ email_verified: undefined, name: '' }))
    expect(mapped).toMatchObject({ emailVerified: false, name: 'ada@kmutt.ac.th' })
  })
})

import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields, adminClient, genericOAuthClient } from 'better-auth/client/plugins'
import { ac, roles } from '../permissions'

export const authClient = createAuthClient({
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: 'string', input: false },
        departmentId: { type: 'string', input: false },
        universityId: { type: 'string', input: true, required: false },
      },
    }),
    adminClient({ ac, roles }),
    // Sign-in through uniauth (provider id `uniauth`) when NEXT_PUBLIC_AUTH_MODE=uniauth.
    genericOAuthClient(),
  ],
})

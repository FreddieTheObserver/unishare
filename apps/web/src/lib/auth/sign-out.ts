import { authClient } from './client'
import { isUniauthMode } from './mode'
import { signOutOfUniauth } from './uniauth'

/** Signs out of unishare, and in uniauth mode out of uniauth as well. */
export async function signOut(router: { replace: (href: string) => void }) {
  if (isUniauthMode) return signOutOfUniauth()
  await authClient.signOut()
  router.replace('/login')
}

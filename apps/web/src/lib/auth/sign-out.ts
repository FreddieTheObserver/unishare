import { signOutOfUniauth } from './uniauth'

/** Signs out of unishare and of uniauth (so every other app's session ends too). */
export async function signOut() {
  return signOutOfUniauth()
}

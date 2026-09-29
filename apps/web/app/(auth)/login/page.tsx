'use client'

import { Suspense } from 'react'
import { UniauthLogin } from '@/components/auth/uniauth-login'

// Sign-in happens on uniauth; this page only starts it (and offers guest access).
export default function LoginPage() {
  return (
    // UniauthLogin reads ?error= with useSearchParams, which needs a Suspense boundary.
    <Suspense>
      <UniauthLogin />
    </Suspense>
  )
}

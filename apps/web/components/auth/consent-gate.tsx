'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { signOut } from '@/src/lib/auth/sign-out'

/**
 * Shown once, before first use, to someone signed in through uniauth who hasn't accepted
 * unishare's terms: an account made on another unicorp app (unigym) reaches unishare through
 * single sign-on without ever seeing them.
 */
export function ConsentGate({ onAccepted }: { onAccepted: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function accept() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/users/me/consent', { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error(String(res.status))
      onAccepted()
    } catch {
      setError('Could not save that. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="flex items-center gap-2.5 mb-10">
        <Image
          src="/icon.svg"
          alt="Unishare logo"
          width={32}
          height={32}
          className="rounded-[6px]"
        />
        <span className="font-mono text-lg font-bold text-foreground">Unishare</span>
      </div>

      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-foreground">Welcome to Unishare</h1>
        <p className="text-sm text-text-secondary mt-2 mb-8">
          Your unicorp account works here too. Before you start, please read and accept
          Unishare&rsquo;s{' '}
          <Link href="/terms" target="_blank" className="underline hover:text-foreground">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" target="_blank" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>

        <Button onClick={accept} disabled={saving} className="w-full h-10.5">
          {saving ? 'Saving…' : 'I agree'}
        </Button>
        {error && <p className="text-xs text-destructive mt-3">{error}</p>}

        <button
          type="button"
          onClick={() => signOut()}
          className="text-sm text-text-muted hover:text-foreground transition-colors duration-150 mt-6"
        >
          Not now, sign out
        </button>
      </div>
    </div>
  )
}

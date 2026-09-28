'use client'

import { Button } from '@/components/ui/button'
import { uniauthAccountURL } from '@/src/lib/auth/mode'

/**
 * AUTH_MODE=uniauth: password, linked Google/Microsoft accounts, name and avatar belong to
 * the unicorp account on uniauth, shared by every unicorp app.
 */
export function UniauthAccountCard() {
  return (
    <div className="border border-border rounded-[6px] p-6 bg-card mb-8">
      <div className="border-b border-border pb-3 mb-5">
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          Account &amp; security
        </h3>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-text-secondary">
          Your name, avatar, password and connected Google or Microsoft accounts are part of your
          unicorp account, used by every unicorp app.
        </p>
        <Button variant="outline" size="sm" asChild>
          <a href={uniauthAccountURL('/profile')}>Manage</a>
        </Button>
      </div>
    </div>
  )
}

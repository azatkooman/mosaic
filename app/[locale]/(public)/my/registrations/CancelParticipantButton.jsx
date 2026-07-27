'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export function CancelParticipantButton({ participantId, label, confirmText }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function cancel() {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    try {
      const res = await fetch('/api/participants/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds: [participantId], status: 'cancelled' }),
      })
      if (res.ok) router.refresh()
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={cancel} disabled={busy}>
      {label}
    </button>
  )
}

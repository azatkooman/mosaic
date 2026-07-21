'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { ParticipantDetail } from '@/app/[locale]/(console)/console/events/[eventId]/participants/ParticipantDetail'

/**
 * Self-service edit: opens the same participant drawer organizers use, but
 * saves through /api/my/participants, which only accepts the registrant who
 * submitted the registration and only while registration is open.
 */
export function EditParticipantButton({ participant, typeName, definition }) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {t('common.edit')}
      </button>
      {open && (
        <ParticipantDetail
          participant={participant}
          typeName={typeName}
          definition={definition}
          canEdit
          endpointBase="/api/my/participants"
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

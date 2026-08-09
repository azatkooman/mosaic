'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import QRCode from 'qrcode'
import { Badge, Dialog } from '@/components/ui'
import styles from './ticket.module.css'

/**
 * Real QR code as SVG (module matrix from the `qrcode` encoder). One path
 * element instead of a rect per module keeps the DOM small, and the 4-module
 * quiet zone is part of the drawing so scanners get their required margin
 * whatever the surrounding layout does.
 */
export function QrCodeSvg({ value, size = 160 }) {
  const { path, dim } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' })
    const quiet = 4
    const dim = modules.size + quiet * 2
    let path = ''
    for (let r = 0; r < modules.size; r++) {
      for (let c = 0; c < modules.size; c++) {
        if (modules.get(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`
      }
    }
    return { path, dim }
  }, [value])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${dim} ${dim}`}
      shapeRendering="crispEdges"
      role="img"
    >
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={path} fill="#0f172a" />
    </svg>
  )
}

/**
 * A confirmed participant's ticket, shown in a centered modal.
 *
 * Built on the shared Dialog (Radix, which portals to <body>) rather than a
 * hand-rolled fixed overlay: the trigger sits inside a registration card that
 * lifts on hover and hides its overflow, and a fixed element left in that
 * subtree gets clipped to the card and flickers as `:hover` toggles.
 */
export function ParticipantTicket({ participant, eventName }) {
  const t = useTranslations('ticket')
  const tCommon = useTranslations('common')
  const tStatus = useTranslations('status')
  const [open, setOpen] = useState(false)

  if (!participant || participant.status !== 'confirmed') return null

  // The QR encodes a URL around the opaque ticket code, so any camera app
  // lands staff on /t/<code> (scanner flow) and everyone else on a generic
  // ticket page. Dialog content only mounts client-side on open, so
  // window is always available here.
  const ticketPayload = `${typeof window === 'undefined' ? '' : window.location.origin}/t/${
    participant.ticket_code ?? participant.id
  }`
  const holder = `${participant.first_name ?? ''} ${participant.last_name ?? ''}`.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('title')}
      className={styles.panel}
      trigger={
        <button className="btn btn-ghost btn-sm">
          <span aria-hidden="true">🎟️</span> {t('view')}
        </button>
      }
    >
      <div className={styles.body}>
        {eventName && <p className={styles.event}>{eventName}</p>}

        {/* The QR stays on a light plate whatever the page theme is — a
            dark-on-dark code will not scan. */}
        <div className={styles.qrPlate}>
          <QrCodeSvg value={ticketPayload} size={180} />
        </div>

        {holder && <p className={styles.holder}>{holder}</p>}
        <p className={styles.muted}>
          {t('id')}: {participant.id.slice(0, 8)}…
        </p>
        <Badge tone="confirmed">{tStatus('confirmed')}</Badge>
      </div>

      <footer className={styles.foot}>
        <Dialog.Close asChild>
          <button type="button" className="btn btn-secondary">
            {tCommon('close')}
          </button>
        </Dialog.Close>
      </footer>
    </Dialog>
  )
}

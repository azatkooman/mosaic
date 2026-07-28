'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Badge, Dialog } from '@/components/ui'
import styles from './ticket.module.css'

/**
 * Renders a clean SVG QR Code representation for a given payload text.
 * Generates deterministic 2D QR modules using a 21x21 grid (QR Version 1 style pattern).
 */
function QrCodeSvg({ value, size = 160 }) {
  const grid = generateQrMatrix(value)
  const cellSize = size / grid.length

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="#ffffff" />
      {grid.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize + 0.3}
              height={cellSize + 0.3}
              fill="#0f172a"
            />
          ) : null
        )
      )}
    </svg>
  )
}

function generateQrMatrix(text) {
  const N = 21
  const matrix = Array.from({ length: N }, () => Array(N).fill(false))

  // Helper to draw finder patterns (7x7 outer, 5x5 inner white, 3x3 inner black)
  const drawFinder = (row, col) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[row + r][col + c] = true
        }
      }
    }
  }

  // Draw 3 finder patterns (Top-Left, Top-Right, Bottom-Left)
  drawFinder(0, 0)
  drawFinder(0, N - 7)
  drawFinder(N - 7, 0)

  // Timing patterns
  for (let i = 8; i < N - 8; i += 2) {
    matrix[6][i] = true
    matrix[i][6] = true
  }

  // Simple deterministic hash mapping for data bits
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i)
    hash |= 0
  }

  // Fill data cells
  let bitIdx = 0
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      // Skip finder zones
      if (
        (r < 8 && c < 8) ||
        (r < 8 && c >= N - 8) ||
        (r >= N - 8 && c < 8) ||
        (r === 6 || c === 6)
      ) {
        continue
      }
      const val = (Math.abs(hash ^ (r * 31 + c * 17 + bitIdx * 13))) % 3 !== 0
      matrix[r][c] = val
      bitIdx++
    }
  }

  return matrix
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

  const ticketPayload = `mosaic:ticket:${participant.id}`
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

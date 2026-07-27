'use client'

import { useState } from 'react'
import { Badge, Button } from '@/components/ui'

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

export function ParticipantTicket({ participant, eventName }) {
  const [open, setOpen] = useState(false)
  if (!participant || participant.status !== 'confirmed') return null

  const ticketPayload = `mosaic:ticket:${participant.id}`

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        🎟️ View Ticket
      </Button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              color: '#0f172a',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '360px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
              Event Ticket
            </div>
            <h3 style={{ margin: '0.5rem 0 1rem', fontSize: '1.25rem', color: '#0f172a' }}>
              {eventName}
            </h3>

            <div
              style={{
                display: 'inline-block',
                padding: '12px',
                border: '2px solid #e2e8f0',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                marginBottom: '1rem',
              }}
            >
              <QrCodeSvg value={ticketPayload} size={180} />
            </div>

            <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              {participant.first_name} {participant.last_name}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.75rem' }}>
              ID: {participant.id.slice(0, 8)}...
            </div>
            <Badge tone="confirmed">CONFIRMED</Badge>

            <div style={{ marginTop: '1.5rem' }}>
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

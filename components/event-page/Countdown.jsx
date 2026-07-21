'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

// Live countdown to an ISO instant, used inside the hero.
// variant: 'minimal' (bare numbers) | 'boxes' (each unit in a card) |
//          'compact' (single 12d : 05h : 32m line).
// tone: 'light' (over dark cover) | 'dark' (on paper) — default colors.
// color: explicit color override for numbers (labels get 65% opacity).
// Hides itself once the target is in the past.
export function Countdown({ targetIso, tone = 'dark', label, variant = 'minimal', color }) {
  const t = useTranslations('event')
  const [remaining, setRemaining] = useState(() => diff(targetIso))

  useEffect(() => {
    if (!targetIso) return
    const id = setInterval(() => setRemaining(diff(targetIso)), 1000)
    return () => clearInterval(id)
  }, [targetIso])

  if (!targetIso || remaining == null || remaining.total <= 0) return null

  const light = tone === 'light'
  const numColor = color || (light ? '#fff' : 'var(--ink)')
  const lblColor = color || (light ? '#fff' : 'var(--ink)')
  const units = [
    [remaining.days, t('countdownDays'), 'd'],
    [remaining.hours, t('countdownHours'), 'h'],
    [remaining.minutes, t('countdownMinutes'), 'm'],
    [remaining.seconds, t('countdownSeconds'), 's'],
  ]

  const labelEl = label && (
    <span
      style={{
        font: '700 11px/1.3 var(--font-body, system-ui)',
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        color: lblColor,
        opacity: 0.65,
        maxWidth: '9ch',
      }}
    >
      {label}
    </span>
  )

  if (variant === 'compact') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        {labelEl}
        <div
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: numColor,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '.02em',
          }}
        >
          {units
            .map(([value, , suffix]) => `${String(value).padStart(2, '0')}${suffix}`)
            .join(' : ')}
        </div>
      </div>
    )
  }

  const boxes = variant === 'boxes'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      {labelEl}
      <div style={{ display: 'flex', gap: boxes ? '10px' : '14px' }}>
        {units.map(([value, unit], i) => (
          <div
            key={i}
            style={{
              textAlign: 'center',
              minWidth: boxes ? '3.6rem' : '2.4ch',
              ...(boxes
                ? {
                    padding: '10px 8px',
                    borderRadius: '10px',
                    background: 'color-mix(in srgb, currentColor 10%, transparent)',
                    border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
                    color: numColor,
                  }
                : {}),
            }}
          >
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                lineHeight: 1,
                color: numColor,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {String(value).padStart(2, '0')}
            </div>
            <div
              style={{
                fontSize: '10px',
                marginTop: '4px',
                textTransform: 'uppercase',
                letterSpacing: '.09em',
                color: lblColor,
                opacity: 0.65,
              }}
            >
              {unit}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function diff(iso) {
  if (!iso) return null
  const total = Date.parse(iso) - Date.now()
  if (Number.isNaN(total)) return null
  const s = Math.max(0, Math.floor(total / 1000))
  return {
    total,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}

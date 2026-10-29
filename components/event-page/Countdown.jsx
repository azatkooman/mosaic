'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'

// The clock as an external store: one tick a second while anything listens.
function subscribeToClock(onTick) {
  const id = setInterval(onTick, 1000)
  return () => clearInterval(id)
}

// Live countdown to an ISO instant, used inside the hero.
// variant: 'minimal' (bare numbers) | 'boxes' (each unit in a card) |
//          'compact' (single 12d : 05h : 32m line).
// tone: 'light' (over dark cover) | 'dark' (on paper) — default colors.
// color: explicit color override for numbers (labels get 65% opacity).
// Hides itself once the target is in the past.
export function Countdown({
  targetIso,
  tone = 'dark',
  label,
  variant = 'minimal',
  color,
  labelDays,
  labelHours,
  labelMinutes,
  labelSeconds,
}) {
  const t = useTranslations('event')
  // Client-only: the value derives from Date.now(), so any server-rendered
  // snapshot is already stale by hydration time and the texts can never match.
  // The server snapshot is null, which renders nothing.
  //
  // The snapshot is the whole seconds left (or -1 once the target has passed),
  // not the breakdown object: useSyncExternalStore compares snapshots with
  // Object.is, so it has to be a primitive that only changes when the display
  // does.
  const getSnapshot = useCallback(() => secondsLeft(targetIso), [targetIso])
  const seconds = useSyncExternalStore(subscribeToClock, getSnapshot, getServerSnapshot)

  if (seconds == null || seconds < 0) return null
  const remaining = breakdown(seconds)

  const light = tone === 'light'
  const numColor = color || (light ? '#fff' : 'var(--ink)')
  const lblColor = color || (light ? '#fff' : 'var(--ink)')
  const units = [
    [remaining.days, labelDays || t('countdownDays'), 'd'],
    [remaining.hours, labelHours || t('countdownHours'), 'h'],
    [remaining.minutes, labelMinutes || t('countdownMinutes'), 'm'],
    [remaining.seconds, labelSeconds || t('countdownSeconds'), 's'],
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

function getServerSnapshot() {
  return null
}

// Whole seconds until `iso`; -1 once it has passed (the countdown hides at the
// target instant itself, not a second later); null for no or a bad date.
function secondsLeft(iso) {
  if (!iso) return null
  const total = Date.parse(iso) - Date.now()
  if (Number.isNaN(total)) return null
  return total > 0 ? Math.floor(total / 1000) : -1
}

function breakdown(s) {
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}

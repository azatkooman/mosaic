'use client'

import { useEffect, useState } from 'react'

const COLORS = ['#e8555a', '#f2a33c', '#3aa981', '#4a90d9', '#b678d4', '#e8c547']

/**
 * A small celebratory confetti burst, no dependencies. Place inside a
 * `position: relative` wrapper around the element to celebrate; pass a new
 * `burst` value (e.g. Date.now()) to fire. Cleans itself up after ~1.6s.
 * Purely decorative: hidden from assistive tech and honors reduced motion
 * (via the CSS in components.css).
 */
export function ConfettiBurst({ burst }) {
  const [activeBurst, setActiveBurst] = useState(null)

  useEffect(() => {
    if (!burst) return
    setActiveBurst(burst)
    const id = setTimeout(() => setActiveBurst(null), 1600)
    return () => clearTimeout(id)
  }, [burst])

  if (!activeBurst) return null

  // Deterministic pseudo-random spread per piece — no Math.random so a
  // React strict-mode double render draws identical pieces.
  const pieces = Array.from({ length: 24 }, (_, i) => {
    const seed = (i * 2654435761 + activeBurst) % 1000
    const angle = (i / 24) * 2 * Math.PI + (seed % 100) / 160
    const dist = 46 + (seed % 46)
    return {
      dx: `${Math.cos(angle) * dist}px`,
      dy: `${Math.sin(angle) * dist * 0.75 - 18}px`,
      rot: `${((seed % 2) ? 1 : -1) * (180 + (seed % 360))}deg`,
      delay: `${(seed % 5) * 30}ms`,
      color: COLORS[i % COLORS.length],
      tall: seed % 3 === 0,
    }
  })

  return (
    <span className="confetti-burst" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={`${activeBurst}-${i}`}
          className="confetti-piece"
          style={{
            '--dx': p.dx,
            '--dy': p.dy,
            '--rot': p.rot,
            background: p.color,
            animationDelay: p.delay,
            width: p.tall ? 5 : 9,
            height: p.tall ? 11 : 6,
          }}
        />
      ))}
    </span>
  )
}

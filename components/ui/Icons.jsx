/** Tiny inline icon set (16px grid, stroke = currentColor). */

const base = { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true }
const stroke = { stroke: 'currentColor', strokeWidth: 1.4 }

export function CalendarIcon() {
  return (
    <svg {...base}>
      <rect x="2" y="3" width="12" height="11" rx="2" {...stroke} />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" {...stroke} />
    </svg>
  )
}

export function PinIcon() {
  return (
    <svg {...base}>
      <path
        d="M8 1.5a4.7 4.7 0 0 1 4.7 4.7c0 3.4-4.7 8.3-4.7 8.3S3.3 9.6 3.3 6.2A4.7 4.7 0 0 1 8 1.5Z"
        {...stroke}
      />
      <circle cx="8" cy="6.2" r="1.6" {...stroke} />
    </svg>
  )
}

export function UserIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="5" r="2.8" {...stroke} />
      <path d="M2.8 14c.8-2.6 2.8-4 5.2-4s4.4 1.4 5.2 4" {...stroke} />
    </svg>
  )
}

export function MailIcon() {
  return (
    <svg {...base}>
      <rect x="1.8" y="3.2" width="12.4" height="9.6" rx="2" {...stroke} />
      <path d="m2.5 4.5 5.5 4.4 5.5-4.4" {...stroke} />
    </svg>
  )
}

export function PhoneIcon() {
  return (
    <svg {...base}>
      <path
        d="M4 1.8h2.2l1.1 3-1.6 1.3a9.4 9.4 0 0 0 4.2 4.2l1.3-1.6 3 1.1v2.2c0 .8-.6 1.4-1.4 1.4C7.3 13.1 2.9 8.7 2.6 3.2c0-.8.6-1.4 1.4-1.4Z"
        {...stroke}
      />
    </svg>
  )
}

export function GlobeIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="6.2" {...stroke} />
      <path d="M1.8 8h12.4M8 1.8c-3.2 3.6-3.2 8.8 0 12.4 3.2-3.6 3.2-8.8 0-12.4Z" {...stroke} />
    </svg>
  )
}

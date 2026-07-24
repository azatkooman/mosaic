// Shared text-style options for the event page and its console editor.
// Lives in its own module so both EventPageView and sections-extra can use it
// without a circular import.

export const HEADING_SIZES = {
  sm: 'clamp(1.1rem, 3vw, 1.25rem)',
  md: 'clamp(1.3rem, 4vw, 1.75rem)',
  lg: 'clamp(1.5rem, 5vw, 2.375rem)',
  xl: 'clamp(1.8rem, 6vw, 3rem)',
}

export const TITLE_SIZES = {
  sm: 'clamp(1.2rem, 4vw, 1.6rem)',
  md: 'clamp(1.5rem, 5vw, 3rem)',
  lg: 'clamp(1.8rem, 6vw, 3.75rem)',
  xl: 'clamp(2.2rem, 8vw, 4.5rem)',
}

// Font options offered in the customize panel. `label: null` means the label
// comes from a translation ("Site font"); named fonts show their own name.
// Each family references a CSS variable loaded via next/font in the layout.
export const FONT_CHOICES = [
  { key: 'default', label: null, family: null },
  { key: 'inter', label: 'Inter', family: 'var(--font-inter), system-ui, sans-serif' },
  { key: 'roboto', label: 'Roboto', family: 'var(--font-roboto), system-ui, sans-serif' },
  { key: 'dmsans', label: 'DM Sans', family: 'var(--font-dm-sans), system-ui, sans-serif' },
  { key: 'poppins', label: 'Poppins', family: 'var(--font-poppins), system-ui, sans-serif' },
  { key: 'jakarta', label: 'Plus Jakarta Sans', family: 'var(--font-jakarta), system-ui, sans-serif' },
  { key: 'sans', label: 'IBM Plex Sans', family: 'var(--font-body), system-ui, sans-serif' },
  { key: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  { key: 'mono', label: 'Mono', family: 'ui-monospace, "SF Mono", Menlo, monospace' },
]

export const FONT_FAMILIES = Object.fromEntries(FONT_CHOICES.map((c) => [c.key, c.family]))

export const TEXT_ALIGNS = ['left', 'center', 'right']

/** Inline style from a {color, size, font, align} style object. */
export function textStyle(hs = {}, sizes = HEADING_SIZES) {
  const style = {}
  if (hs.color) style.color = hs.color
  if (hs.size && sizes[hs.size]) style.fontSize = sizes[hs.size]
  if (hs.font && FONT_FAMILIES[hs.font]) style.fontFamily = FONT_FAMILIES[hs.font]
  if (hs.align && TEXT_ALIGNS.includes(hs.align)) style.textAlign = hs.align
  return style
}

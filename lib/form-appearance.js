/**
 * How a registration form looks, resolved and turned into CSS.
 *
 * Stored in `forms.appearance` (0055) — deliberately not in the versioned form
 * definition, so changing a colour never mints a form version or needs a
 * Publish. `{}` means "inherit", and inherit means the event page's own theme
 * (`events.page_content.theme`), so a form nobody has customized still looks
 * like the event it belongs to instead of like a second set of defaults.
 *
 * The whole thing is applied as CSS custom properties on a wrapper element.
 * That is the reason `FormRenderer`, `QuestionField`, `Field` and `Button` need
 * no changes to be themeable: they already read `--ink`, `--surface`, `--line`,
 * `--pine`, `--r-md` and friends, so overriding those tokens on an ancestor
 * re-skins every control inside at once.
 *
 * This differs on purpose from the event page, which namespaces its own
 * `--ep-*` variables: that page is built from bespoke markup that reads them,
 * whereas a form is built from the shared component library and is re-skinned
 * by moving the tokens underneath it.
 */

import { FONT_FAMILIES } from '@/components/event-page/text-style'

/**
 * The stored values are the EVENT PAGE's vocabulary, not a second one.
 *
 * Inheritance is the reason. A form with no scale of its own reads the event
 * page's `text_scale`, and the event page writes 'compact' | 'normal' |
 * 'large'; a form-only vocabulary of 'small' | 'normal' | 'large' would find no
 * entry for 'compact' and silently ignore an inherited setting — visible as
 * nothing at all, which is the worst way for it to fail. Same for radius
 * ('square', not 'sharp') and density ('spacious', not 'roomy').
 */
const SCALES = {
  text: { compact: 0.9, normal: 1, large: 1.15 },
  radius: { square: 0, normal: 1, round: 2.2 },
  density: { compact: 0.78, normal: 1, spacious: 1.3 },
}

export const WIDTHS = { narrow: '34rem', normal: null, wide: '52rem' }

/** Option lists for the customize panel, in the same vocabulary. */
export const APPEARANCE_OPTIONS = {
  text_scale: ['compact', 'normal', 'large'],
  radius: ['square', 'normal', 'round'],
  density: ['compact', 'normal', 'spacious'],
  width: ['narrow', 'normal', 'wide'],
  progress: ['count', 'none'],
}

/** Theme keys a form inherits from the event page when it sets none of its own. */
const INHERITED = [
  'page_bg',
  'text_color',
  'title_color',
  'primary_color',
  'title_font',
  'body_font',
  'text_scale',
  'radius',
  'width',
  'density',
]

const BASE_TEXT = {
  '--text-xs': 0.75,
  '--text-sm': 0.875,
  '--text-md': 1,
  '--text-lg': 1.125,
  '--text-xl': 1.375,
  '--text-2xl': 1.75,
  '--text-3xl': 2.375,
}

const BASE_SPACE = {
  '--s-1': 0.25,
  '--s-2': 0.5,
  '--s-3': 0.75,
  '--s-4': 1,
  '--s-5': 1.5,
  '--s-6': 2,
}

const BASE_RADIUS = { '--r-sm': 6, '--r-md': 10, '--r-lg': 16 }

/**
 * Layer a form's own appearance over the event page's theme.
 *
 * Only the keys the two genuinely share are inherited — a form has no hero and
 * an event page has no field labels — and a form key set to anything at all
 * wins, including a colour the organizer deliberately cleared back to empty
 * (which reads as unset and inherits again, the same way the event page's own
 * colour inputs behave).
 */
export function resolveFormAppearance(appearance, eventTheme) {
  const own = appearance ?? {}
  const ownTheme = own.theme ?? {}
  const inherited = eventTheme ?? {}

  const theme = {}
  for (const key of INHERITED) {
    // `??` is not enough: an emptied colour is '', which is not nullish, so it
    // would win the coalesce and then be dropped by the filter below — leaving
    // the key unset rather than inherited, which is the opposite of what
    // clearing a control should do.
    const ownValue = isSet(ownTheme[key]) ? ownTheme[key] : undefined
    const value = ownValue ?? inherited[key]
    if (isSet(value)) theme[key] = value
  }

  const ownHeader = own.header ?? {}
  const bg_image_path = ownHeader.bg_image_path ?? own.header_image_path ?? undefined

  return {
    theme,
    header: { ...ownHeader, ...(bg_image_path ? { bg_image_path } : {}) },
    intro: own.intro ?? {},
    questions: own.questions ?? {},
    nav: own.nav ?? {},
  }
}

/**
 * The CSS custom properties a resolved appearance sets on the form's wrapper.
 *
 * Scales rewrite whole token families rather than setting one font-size,
 * because the tokens are in rem and would otherwise ignore a font-size on an
 * ancestor. Only families the organizer actually changed are emitted, so an
 * untouched form adds no declarations at all and renders byte-identically to
 * how it renders today.
 */
export function appearanceVars(resolved) {
  const t = resolved?.theme ?? {}
  const vars = {}

  if (t.page_bg) {
    vars.background = t.page_bg
    vars['--paper'] = t.page_bg
    // Inputs and cards sit ON the page, so a themed page with default-white
    // fields looks unfinished. Tinting the surface toward the page keeps the
    // two related without flattening the field into its background.
    vars['--surface'] = `color-mix(in srgb, ${t.page_bg} 88%, white)`
    vars['--surface-sunken'] = `color-mix(in srgb, ${t.page_bg} 94%, black)`
  }
  // Ink follows the background when the organizer has not chosen one, and it
  // has to: dark and light mode supply --ink from a media query and a
  // [data-theme] attribute, neither of which a wrapper can override. Set a pale
  // page background without this and every reader in dark mode gets pale text
  // on it — unreadable, on the registrant's screen rather than the organizer's,
  // and invisible to the organizer who set it in light mode.
  const ink = t.text_color || (t.page_bg ? readableInk(t.page_bg) : null)
  if (ink) {
    vars.color = ink
    vars['--ink'] = ink
    vars['--ink-soft'] = `color-mix(in srgb, ${ink} 72%, transparent)`
    vars['--ink-faint'] = `color-mix(in srgb, ${ink} 48%, transparent)`
    vars['--line'] = `color-mix(in srgb, ${ink} 18%, transparent)`
    vars['--line-strong'] = `color-mix(in srgb, ${ink} 34%, transparent)`
  }
  if (t.primary_color) {
    vars['--pine'] = t.primary_color
    // Hover has to stay distinguishable from rest, so it is derived rather than
    // set to the same colour — a primary button whose hover does nothing reads
    // as a broken button.
    vars['--pine-deep'] = `color-mix(in srgb, ${t.primary_color} 82%, black)`
    vars['--pine-tint'] = `color-mix(in srgb, ${t.primary_color} 14%, white)`
    vars['accentColor'] = t.primary_color
  }
  // Fonts are stored as the picker's key ('inter'), not a family string, so the
  // same catalogue backs the event page and the form and neither can drift onto
  // a family the layout never loaded.
  if (FONT_FAMILIES[t.body_font]) vars['--font-body'] = FONT_FAMILIES[t.body_font]
  if (FONT_FAMILIES[t.title_font]) vars['--font-display'] = FONT_FAMILIES[t.title_font]

  const textFactor = SCALES.text[t.text_scale]
  if (textFactor && textFactor !== 1) {
    for (const [name, rem] of Object.entries(BASE_TEXT)) {
      vars[name] = `${round(rem * textFactor)}rem`
    }
  }

  const spaceFactor = SCALES.density[t.density]
  if (spaceFactor && spaceFactor !== 1) {
    for (const [name, rem] of Object.entries(BASE_SPACE)) {
      vars[name] = `${round(rem * spaceFactor)}rem`
    }
  }

  const radiusFactor = SCALES.radius[t.radius]
  if (radiusFactor != null && radiusFactor !== 1) {
    for (const [name, px] of Object.entries(BASE_RADIUS)) {
      vars[name] = `${Math.round(px * radiusFactor)}px`
    }
  }

  const width = WIDTHS[t.width]
  if (width) vars['--container-narrow'] = width

  return vars
}

/**
 * Per-question label and help styling, resolved most-specific-first:
 * this question → its type → the form's defaults.
 *
 * Returns CSS variables rather than inline styles because the label is drawn
 * several layers down inside the shared `Field`, and `QuestionField` reaches it
 * through eleven different call sites — a variable on a wrapper reaches all of
 * them, a prop would have to be threaded through every one.
 */
export function questionVars(resolved, question) {
  const q = resolved?.questions ?? {}
  const style = {
    ...(q.defaults ?? {}),
    ...(q.byType?.[question?.type] ?? {}),
    ...(q.byId?.[question?.id] ?? {}),
  }

  const vars = {}
  if (style.label_color) vars['--q-label-color'] = style.label_color
  if (LABEL_SIZES[style.label_size]) vars['--q-label-size'] = LABEL_SIZES[style.label_size]
  if (style.help_color) vars['--q-help-color'] = style.help_color
  if (style.section_color) vars['--q-section-color'] = style.section_color
  return vars
}

/*
 * The zone decisions, as functions rather than as `?? true` written twice.
 *
 * Two surfaces render this screen — the console's Forms page tab and the real
 * register page — and they are separate code by necessity: half the real screen
 * is built by a server component and half by the client wizard. Reading the
 * flags through here is what stops the preview and the page disagreeing about
 * what the organizer just switched off.
 *
 * All three default to ON, so a form with no appearance renders exactly the
 * screen that existed before any of this.
 */
export function showsBackLink(resolved) {
  return resolved?.header?.show_back !== false
}

export function showsLanguagePicker(resolved) {
  return resolved?.header?.show_language !== false
}

export function showsProgress(resolved) {
  return (resolved?.nav?.progress ?? 'count') !== 'none'
}

/** The intro blurb for a language, or null when there is nothing to show. */
export function introTextFor(resolved, locale, defaultLocale) {
  if (resolved?.intro?.enabled !== true) return null
  const map = resolved.intro.text
  if (!map || typeof map !== 'object') return null
  const text = map[locale] ?? map[defaultLocale] ?? ''
  return typeof text === 'string' && text.trim() ? text : null
}

/** Inline style for the page title, which is not a token-driven control. */
export function titleStyle(resolved) {
  const color = resolved?.theme?.title_color
  return color ? { color } : undefined
}

/** Label sizes offered per question/type. Keys are stored, not the rem values. */
export const LABEL_SIZES = {
  sm: '0.8125rem',
  md: '1rem',
  lg: '1.25rem',
}

/** True when a question carries any styling of its own (drives the panel's dot). */
export function hasOwnStyle(appearance, questionId) {
  const own = appearance?.questions?.byId?.[questionId]
  return !!own && Object.values(own).some((v) => v !== undefined && v !== '')
}

/**
 * Drop per-question styling for questions that no longer exist.
 *
 * Overrides are keyed by question id and live outside the definition, so
 * deleting a question strands its entry. Unknown ids are already harmless at
 * render time — `questionVars` simply never looks them up — so this exists to
 * stop the column growing forever, not to prevent a bug. Returns the original
 * object when there is nothing to drop, so it can be called on every save
 * without manufacturing a change.
 */
export function pruneQuestionStyles(appearance, questionIds) {
  const byId = appearance?.questions?.byId
  if (!byId) return appearance
  const live = new Set(questionIds)
  const kept = Object.fromEntries(Object.entries(byId).filter(([id]) => live.has(id)))
  if (Object.keys(kept).length === Object.keys(byId).length) return appearance
  return {
    ...appearance,
    questions: { ...appearance.questions, byId: kept },
  }
}

/**
 * Near-black or near-white, whichever is legible on `hex`.
 *
 * The 0.55 threshold rather than 0.5 because mid-tones read darker than their
 * luminance suggests, and the two ends are the palette's own ink colours rather
 * than pure black and white, which look harsh against a tinted page.
 */
export function readableInk(hex) {
  const l = relativeLuminance(hex)
  if (l == null) return null
  return l > 0.55 ? '#20242b' : '#f4f2ec'
}

function relativeLuminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function isSet(v) {
  return v !== undefined && v !== null && v !== ''
}

function round(n) {
  return Math.round(n * 1000) / 1000
}

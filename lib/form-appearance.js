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

import { FONT_FAMILIES, hexToRgba } from '@/components/event-page/text-style'

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

  // Own-only, and deliberately not in INHERITED: the event page's background is
  // opaque and has no opacity to inherit. This is purely how the FORM treats
  // whatever colour it ends up with — so an inherited colour can still be faded
  // here, and it keeps following the event page's colour while it fades.
  if (isSet(ownTheme.page_bg_opacity)) theme.page_bg_opacity = ownTheme.page_bg_opacity

  return {
    theme,
    header: resolveHeader(own.header ?? {}, inherited),
    intro: own.intro ?? {},
    questions: own.questions ?? {},
    nav: own.nav ?? {},
  }
}

/**
 * The header band's own settings, layered over the event page's hero.
 *
 * `bg_color`/`bg_opacity` inherit from `hero_bg`/`hero_opacity` because they
 * are the same control offered twice — the band is a form's hero — and a form
 * nobody has customized should arrive wearing the event's colours the way its
 * theme already does. The two travel together on purpose: a form that sets its
 * own colour uses its own opacity (100 by default), rather than an opacity left
 * over from an event colour it just replaced.
 *
 * `bg_image_path` is the exception and does NOT inherit. An organizer who wants
 * the event's cover behind the header says so with the panel's "use the event
 * cover" button, which copies the path in. Inheriting silently would put a hero
 * photo behind the header of every form on every event that has one, uninvited,
 * and absent would then mean "yes please" — leaving no way to switch it off.
 */
function resolveHeader(ownHeader, inherited) {
  const header = { ...ownHeader }

  if (isSet(ownHeader.bg_color)) {
    header.bg_color = ownHeader.bg_color
    header.bg_opacity = ownHeader.bg_opacity ?? 100
  } else if (isSet(inherited.hero_bg)) {
    header.bg_color = inherited.hero_bg
    header.bg_opacity = inherited.hero_opacity ?? 100
  } else {
    // Cleared back to empty reads as unset, like every other colour control.
    delete header.bg_color
    delete header.bg_opacity
  }

  return header
}

/**
 * What to paint the header band with, and what colour its text has to be.
 *
 * The band holds the back link, the language picker and the page title, so it
 * is a surface of its own with its own legibility problem: the shells are
 * translucent white, which means their text is whatever the band's text is, and
 * getting that wrong is invisible to an organizer working in light mode.
 *
 * Returns `hasBackdrop: false` when the organizer has set neither an image nor
 * a colour, and then the band paints nothing, sets no colour, and the header
 * renders exactly the screen it did before any of this existed.
 */
export function headerBand(resolved, imageUrl) {
  const h = resolved?.header ?? {}
  // Taken from the URL the caller resolved rather than from the stored path,
  // and that is not a shortcut: only the caller can turn a path into a URL
  // (`eventMediaUrl` needs the bucket), so a band that decided "there is an
  // image" from the path could disagree with a caller that had no URL to render
  // — a header styled for a photo that is not there.
  const hasImage = !!imageUrl
  const tint = hexToRgba(h.bg_color, h.bg_opacity)
  const hasBackdrop = hasImage || !!tint

  const style = {}
  // With an image the colour becomes a TINT laid over the photo — exactly what
  // the event page's hero_bg does over a cover — so it goes on the overlay
  // rather than on the band, or it would paint over the picture entirely.
  if (!hasImage && tint) style.background = tint
  const ink = hasBackdrop ? bandInk(resolved, h, hasImage) : null
  if (ink) style.color = ink

  return {
    hasBackdrop,
    hasImage,
    style: Object.keys(style).length ? style : undefined,
    // Absent means the default scrim in the stylesheet stands in, which is what
    // makes light text safe over a photo nobody has tinted.
    overlayStyle: hasImage && tint ? { background: tint } : undefined,
  }
}

/**
 * Near-white or near-black for the band's contents, or null to inherit.
 *
 * Null is the honest answer more often than it looks: with no colour of its own
 * the band sits on the page, whose ink is already correct for the page's
 * background — including the one case a server cannot compute, where the reader
 * is in dark mode and the organizer set no page colour at all.
 */
function bandInk(resolved, h, hasImage) {
  const alpha = (h.bg_opacity == null ? 100 : Math.max(0, Math.min(100, h.bg_opacity))) / 100

  if (hasImage) {
    // Above this the colour is what the reader sees; below it the photo is, and
    // the photo is under a scrim dark enough to take light text.
    if (isSet(h.bg_color) && alpha >= 0.6) return readableInk(h.bg_color)
    return '#f4f2ec'
  }
  if (!isSet(h.bg_color)) return null
  // Near-opaque: the page underneath cannot show through enough to matter.
  if (alpha >= 0.75) return readableInk(h.bg_color)
  const base = resolved?.theme?.page_bg
  if (!base) return null
  return readableInk(blendHex(h.bg_color, alpha, base))
}

/**
 * The form's background colour, faded by `page_bg_opacity`.
 *
 * Returns the raw hex when there is nothing to fade, so the untouched and
 * fully-opaque cases emit the identical declaration they always have — an
 * `rgba(…, 1)` would render the same and quietly change every stored form's
 * computed style for no reason.
 */
function pageSurface(t) {
  const pct = t.page_bg_opacity
  if (pct == null || pct >= 100) return t.page_bg
  return hexToRgba(t.page_bg, pct) ?? t.page_bg
}

/** The two things a see-through form can be sitting on (tokens.css `--paper`). */
const PAPER_LIGHT = '#faf9f6'
const PAPER_DARK = '#17191e'

/**
 * Ink for a form background that may be see-through.
 *
 * What the reader actually sees is the organizer's colour composited over the
 * page behind it, and that page is light or dark by the VIEWER's setting — a
 * media query and a `[data-theme]` attribute, neither of which a server can
 * read. So the colour alone does not answer the question once it is faded.
 *
 * Rather than guess, ask both: composite over the light paper and over the dark
 * one, and take the answer only when the two agree. They agree exactly when the
 * organizer's colour is dominant enough to decide the matter on its own, and
 * that is precisely when overriding `--ink` is safe.
 *
 * When they disagree the colour has washed out far enough that the paper is
 * what is being read against — so inheriting is not a fallback, it is the right
 * answer: the platform's own ink is already correct for each mode's paper.
 *
 * A single opacity threshold was tried first and is not good enough. At 70% of
 * a dark colour over the light paper the composite is still dark and needs
 * light text, but the threshold had already handed ink back — giving dark text
 * on a dark form, which is the exact failure this whole mechanism exists to
 * prevent, just moved to a different opacity.
 */
function pageInk(t) {
  const pct = t.page_bg_opacity
  if (pct == null || pct >= 100) return readableInk(t.page_bg)
  const alpha = Math.max(0, Math.min(100, pct)) / 100
  const onLight = readableInk(blendHex(t.page_bg, alpha, PAPER_LIGHT))
  const onDark = readableInk(blendHex(t.page_bg, alpha, PAPER_DARK))
  return onLight === onDark ? onLight : null
}

/** `fg` at `alpha` composited over `bg`, as `#rrggbb`. Null if either is unparseable. */
function blendHex(fg, alpha, bg) {
  const a = rgbOf(fg)
  const b = rgbOf(bg)
  if (!a || !b) return null
  const mix = a.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)))
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`
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
    // The colour at whatever opacity the organizer set, so the screen behind
    // the form shows through it. Left as the raw hex when there is no opacity
    // or it is full, which keeps an untouched form's declarations exactly the
    // string they have always been rather than an equivalent rgba().
    const surface = pageSurface(t)
    vars.background = surface
    vars['--paper'] = surface
    // Inputs and cards sit ON the page, so a themed page with default-white
    // fields looks unfinished. Tinting the surface toward the page keeps the
    // two related without flattening the field into its background.
    //
    // Mixing the already-faded colour rather than the raw one is what makes
    // fields fade WITH the background instead of staying fully painted over a
    // washed-out page — and it keeps them a little more solid than the page as
    // it goes, because mixing toward opaque white and black raises the alpha
    // back up. At full opacity both mixes are the ones that were here before.
    vars['--surface'] = `color-mix(in srgb, ${surface} 88%, white)`
    vars['--surface-sunken'] = `color-mix(in srgb, ${surface} 94%, black)`
  }
  // Ink follows the background when the organizer has not chosen one, and it
  // has to: dark and light mode supply --ink from a media query and a
  // [data-theme] attribute, neither of which a wrapper can override. Set a pale
  // page background without this and every reader in dark mode gets pale text
  // on it — unreadable, on the registrant's screen rather than the organizer's,
  // and invisible to the organizer who set it in light mode.
  const ink = t.text_color || (t.page_bg ? pageInk(t) : null)
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
 * The shape of the block the form's own background paints.
 *
 * The colour itself comes from `appearanceVars`, which sets it on the same
 * element — this only decides whether that colour is a full-bleed band or a
 * card with room above and below it. Separate from `appearanceVars` because
 * the wizard re-applies those variables per participant type on a panel INSIDE
 * this one (so a mode form's own colours win from the eyebrow down); geometry
 * emitted from there would draw a second card inside the first.
 *
 * `square` keeps the flush band it has always been — someone who asked for
 * square corners is not asking for a floating card. Every other setting,
 * including none at all (which renders at the default radius), gets the card:
 * `--r-lg` already carries the organizer's choice, scaled, so the corners
 * follow the Corner Radius control without this having to know the factor.
 *
 * Undefined when no colour is set, because there is then no block to shape and
 * a margin would only push the content down for nothing.
 */
export function formSurfaceStyle(resolved) {
  const t = resolved?.theme ?? {}
  if (!isSet(t.page_bg)) return undefined
  if (t.radius === 'square') return undefined
  return { borderRadius: 'var(--r-lg)', marginBlock: 'var(--s-5)' }
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

/**
 * Inline colour for the intro blurb, and for the "Participant 1 of 2" line.
 *
 * Undefined rather than `{}` when unset, so each keeps inheriting what it
 * inherits today — the page's `--ink` for the intro, `--gold-deep` for the
 * progress line via `.eyebrow`. Neither inherits from the event page: the event
 * page has no intro blurb and no participant counter, so there is nothing there
 * to inherit FROM, and inventing a mapping would tie them to a colour chosen
 * for something else entirely.
 */
export function introStyle(resolved) {
  const color = resolved?.intro?.color
  return color ? { color } : undefined
}

export function progressStyle(resolved) {
  const color = resolved?.nav?.progress_color
  return color ? { color } : undefined
}

/** The intro blurb for a language, or null when there is nothing to show. */
export function introTextFor(resolved, locale, defaultLocale) {
  if (resolved?.intro?.enabled !== true) return null
  const map = resolved.intro.text
  if (!map || typeof map !== 'object') return null
  const text = map[locale] ?? map[defaultLocale] ?? ''
  return typeof text === 'string' && text.trim() ? text : null
}

/**
 * Inline style for the page title, which is not a token-driven control.
 *
 * Still read from `theme.title_color` even though the control that sets it now
 * lives on the Header tab beside the band's own background — the control moved,
 * the storage did not. `title_color` is one of the INHERITED keys, so moving it
 * under `header` would quietly stop a form picking up the event page's title
 * colour, which is a behaviour change nobody asked for and nothing on screen
 * would explain.
 *
 * Undefined rather than `{}` when unset, so the title inherits: from the band
 * when the band has a backdrop of its own, and from the page otherwise.
 */
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
 * The ends are the palette's own ink colours rather than pure black and white,
 * which look harsh against a tinted page. The threshold is where the two swap
 * places for real: solving WCAG contrast for the point at which `#20242b`
 * (luminance 0.017) and `#f4f2ec` (0.888) score equally against a background
 * gives 0.20, not the 0.55 this used to carry.
 *
 * That 0.55 was picking light text across the whole 0.20–0.55 band, where dark
 * text is several times more legible — `#bebbb4` scores 1.7:1 against light ink
 * and 8.1:1 against dark, and 1.7 is unreadable. It went unnoticed because the
 * only thing feeding this was `page_bg`, which organizers tend to set to
 * something clearly pale or clearly dark; a header colour laid over the page at
 * 25% lands in the middle of that band almost every time, which is how it
 * surfaced.
 */
export function readableInk(hex) {
  const l = relativeLuminance(hex)
  if (l == null) return null
  return l > 0.2 ? '#20242b' : '#f4f2ec'
}

function relativeLuminance(hex) {
  const rgb = rgbOf(hex)
  if (!rgb) return null
  const channels = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** `#rrggbb` → [r, g, b], or null. Six digits only: the colour inputs emit six. */
function rgbOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function isSet(v) {
  return v !== undefined && v !== null && v !== ''
}

function round(n) {
  return Math.round(n * 1000) / 1000
}

'use client'

import { Fragment } from 'react'
import { useTranslations } from 'next-intl'
import { lt, LOCALES } from '@/lib/i18n/locales'
import { formatEventDate, formatEventDateRange } from '@/lib/dates'
import { eventMediaUrl } from '@/lib/storage'
import { StatIcon } from './stat-icons'
import { Countdown } from './Countdown'
import { textStyle, TITLE_SIZES, FONT_FAMILIES } from './text-style'
import { videoEmbedSrc } from './video'
import {
  TracksSection,
  TestimonialsSection,
  GallerySection,
  FaqSection,
  MapSection,
} from './sections-extra'
import styles from './event-page-view.module.css'

// Hero layout variants (used by the console editor's dropdown).
export const HERO_VARIANTS = ['classic', 'split']

// Body sections in their default order. The hero is always first and is not
// part of this list. Organizers can reorder these via page_content.order.
export const ORDERABLE_SECTIONS = [
  'about',
  'speakers',
  'tracks',
  'agenda',
  'testimonials',
  'gallery',
  'faq',
  'tickets',
  'map',
  'contact',
]

// Resolve the saved order, keeping only known keys and appending any that are
// missing (e.g. sections added after the order was saved) in default order.
export function resolveSectionOrder(content) {
  const saved = Array.isArray(content?.order)
    ? content.order.filter((k) => ORDERABLE_SECTIONS.includes(k))
    : []
  const missing = ORDERABLE_SECTIONS.filter((k) => !saved.includes(k))
  return [...saved, ...missing]
}

// Text-style options live in ./text-style (shared with sections-extra and the
// console editor); re-exported here so existing imports keep working.
export { HEADING_SIZES, TITLE_SIZES, FONT_CHOICES, FONT_FAMILIES } from './text-style'

// Hex (#rgb or #rrggbb) + opacity percent (0–100) → rgba() string.
function hexToRgba(hex, opacityPct) {
  if (!hex) return null
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return null
  const a = opacityPct == null ? 1 : Math.max(0, Math.min(100, opacityPct)) / 100
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M13.6 2.9a1.8 1.8 0 0 1 2.5 2.5l-8.9 8.9-3.4.9.9-3.4 8.9-8.9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Module scope on purpose: defining these inside EventPageView would give
// them a new component identity each render, forcing React to remount the
// whole section subtree on every parent update.

function Section({ id, section, className, style, dataFlat, editable, onEditSection, editLabel, children }) {
  return (
    <section
      id={id}
      className={`${className ?? ''} ${editable ? styles.editable : ''}`}
      style={style}
      data-flat-hero={dataFlat ? '' : undefined}
    >
      {children}
      {editable && (
        <button
          type="button"
          className={styles.pencil}
          aria-label={editLabel}
          title={editLabel}
          onClick={() => onEditSection?.(section)}
        >
          <PencilIcon />
        </button>
      )}
    </section>
  )
}

function SectionHeading({ text, headingStyle, centered }) {
  return (
    <h2
      className={`${styles.sectionTitle} ${centered ? styles.centered : ''}`}
      style={textStyle(headingStyle)}
    >
      {text}
    </h2>
  )
}

function RegisterCta({ editable, registerHref, label }) {
  const cls = `btn ${styles.registerBtn}`
  if (editable) {
    return (
      <span className={cls} aria-disabled="true">
        {label}
      </span>
    )
  }
  return (
    <a className={cls} href={registerHref}>
      {label}
    </a>
  )
}

/**
 * The public event landing page. Rendered by the public route AND by the
 * console's Event Page tab (editable=true adds hover pencils per section).
 */
export function EventPageView({
  event,
  locale,
  contentLocale,
  registerHref,
  editable = false,
  onEditSection,
}) {
  const t = useTranslations('event')
  const content = event.page_content ?? {}
  const dl = event.default_locale
  // `locale` is a real platform locale (used for dates/number formatting);
  // `contentLocale` is what the organizer's text is resolved in — may be a
  // custom language code that Intl doesn't know, so it never touches dates.
  const cl = contentLocale || locale

  const L = (map) => lt(map, cl, dl)

  const theme = content.theme ?? {}
  const hero = content.hero ?? {}

  // The hero title font doubles as the default font for every section
  // heading; a section's own heading font (if set) still wins.
  const inheritTitleFont = (s = {}) =>
    theme.title_font && !s.heading_style?.font
      ? { ...s, heading_style: { ...(s.heading_style ?? {}), font: theme.title_font } }
      : s

  const about = inheritTitleFont(content.about ?? {})
  const speakers = inheritTitleFont(content.speakers ?? {})
  const agenda = inheritTitleFont(content.agenda ?? {})
  const tickets = inheritTitleFont(content.tickets ?? {})
  const contactSection = inheritTitleFont(content.contact ?? {})
  const tracks = inheritTitleFont(content.tracks ?? {})
  const testimonials = inheritTitleFont(content.testimonials ?? {})
  const gallery = inheritTitleFont(content.gallery ?? {})
  const faq = inheritTitleFont(content.faq ?? {})
  const mapSection = inheritTitleFont(content.map ?? {})
  const chipBg = hexToRgba(hero.chip_bg, hero.chip_bg_opacity)
  const sectionBg = (s) => (s?.bg ? { background: s.bg } : undefined)

  const heroVariant = theme.hero_variant === 'split' ? 'split' : 'classic'
  const countdownTarget =
    hero.countdown_target === 'registration_closes_at'
      ? event.registration_closes_at
      : hero.countdown_target === 'ends_at'
        ? event.ends_at
        : event.starts_at

  // Per-image display adjustments (fit / focal position / height preset).
  const IMAGE_HEIGHTS = { sm: '12rem', md: '18rem', lg: '28rem' }
  const imgAdjust = (d = {}, prefix = 'image') => {
    const s = {}
    const fit = d[`${prefix}_fit`]
    const pos = d[`${prefix}_pos`]
    const h = d[`${prefix}_height`]
    if (fit) s.objectFit = fit
    if (pos) s.objectPosition = pos
    if (h && IMAGE_HEIGHTS[h]) {
      s.height = IMAGE_HEIGHTS[h]
      s.minHeight = 0
    }
    return s
  }
  const aboutVideo = videoEmbedSrc(about.video_url)
  const showAbout =
    about.enabled && (L(about.body) || about.image_path || aboutVideo || about.stats?.length)
  const showSpeakers = speakers.enabled && speakers.items?.length > 0
  const showAgenda = agenda.enabled && (agenda.items?.length > 0 || agenda.image_path)
  const showTickets = tickets.enabled && tickets.items?.length > 0

  const now = Date.now()
  const opensAt = event.registration_opens_at ? Date.parse(event.registration_opens_at) : null
  const closesAt = event.registration_closes_at ? Date.parse(event.registration_closes_at) : null
  const notOpenYet = opensAt != null && now < opensAt
  const closed = closesAt != null && now > closesAt

  const coverUrl = eventMediaUrl(event.cover_image_path)
  const name = L(event.name)
  const description = L(event.description)
  const location = L(event.location)
  const contact = event.contact ?? {}
  const hasContact = contact.name || contact.email || contact.phone || contact.website

  const pageStyle = {}
  if (theme.page_bg) pageStyle['--ep-bg'] = theme.page_bg
  if (theme.text_color) pageStyle['--ep-text'] = theme.text_color
  if (theme.primary_color) pageStyle['--ep-primary'] = theme.primary_color
  if (theme.accent_color) pageStyle['--ep-accent'] = theme.accent_color
  if (theme.btn_bg) pageStyle['--ep-btn-bg'] = theme.btn_bg
  if (theme.btn_text) pageStyle['--ep-btn-text'] = theme.btn_text
  if (theme.body_font && FONT_FAMILIES[theme.body_font]) {
    pageStyle.fontFamily = FONT_FAMILIES[theme.body_font]
  }

  const titleStyle = textStyle(
    { color: theme.title_color, size: theme.title_size, font: theme.title_font },
    TITLE_SIZES
  )

  // Hero background color + opacity. Opacity only makes sense as a tint OVER a
  // cover image; with no image the color fills the hero solid (a translucent
  // fill would just blend with the page behind it and look washed out/white).
  const heroTint = coverUrl ? hexToRgba(theme.hero_bg, theme.hero_opacity) : null

  // With no cover image, let the hero adopt the chosen colors so theme changes
  // are visible at the very top of the page (otherwise it keeps its default
  // dark background and looks unaffected).
  const flatHero = !coverUrl && (theme.hero_bg || theme.page_bg || theme.text_color)
  const heroStyle = {}
  if (flatHero) {
    if (theme.hero_bg) heroStyle.background = theme.hero_bg
    else if (theme.page_bg) heroStyle.background = theme.page_bg
    if (theme.text_color) heroStyle.color = theme.text_color
  }

  // Bound builders keep call sites terse while the components stay module-scope.
  const sectionProps = { editable, onEditSection, editLabel: t('edit') }
  const heading = (sectionData, fallback, centered) => (
    <SectionHeading
      text={L(sectionData.heading) || fallback}
      headingStyle={sectionData.heading_style}
      centered={centered}
    />
  )
  const registerButton = (
    <RegisterCta editable={editable} registerHref={registerHref} label={t('register')} />
  )

  // Logo + language switcher bar. Position controls horizontal alignment,
  // placement puts the bar at the top or bottom of the hero.
  const logo = content.logo ?? {}
  const logoUrl = eventMediaUrl(logo.path)
  const logoPos = ['left', 'center', 'right'].includes(logo.position) ? logo.position : 'left'
  const logoAtBottom = logo.placement === 'bottom'
  // Custom (organizer-defined) languages, e.g. { code: 'pt', name: 'Português' }.
  const customLangs = Array.isArray(content.i18n?.custom) ? content.i18n.custom : []
  const customCodes = customLangs.map((c) => c.code)
  const validCodes = new Set([...LOCALES, ...customCodes])
  const availableLocales = (
    Array.isArray(content.i18n?.available) && content.i18n.available.length
      ? content.i18n.available
      : event.supported_locales?.length
        ? event.supported_locales
        : [dl]
  ).filter((l) => validCodes.has(l))
  const showLangSwitch = availableLocales.length > 1
  const eventSlug = event.slug
  const isCustom = (code) => customCodes.includes(code)
  const langLabel = (code) =>
    isCustom(code) ? customLangs.find((c) => c.code === code)?.name || code : code.toUpperCase()
  // Built-in locales get their own route; custom ones ride on the current
  // route locale via a ?lang= param (they aren't platform routes).
  const langHref = (code) =>
    isCustom(code) ? `/${locale}/events/${eventSlug}?lang=${code}` : `/${code}/events/${eventSlug}`

  const heroTopBar = (logoUrl || showLangSwitch) && (
    <div className={styles.heroTopBar} data-logo-pos={logoPos}>
      {logoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img className={styles.heroLogo} src={logoUrl} alt="" />
      ) : (
        <span />
      )}
      {showLangSwitch && (
        <nav className={styles.langSwitch} aria-label="Language">
          {availableLocales.map((l) =>
            editable ? (
              <span key={l} data-active={l === cl ? '' : undefined}>
                {langLabel(l)}
              </span>
            ) : (
              <a key={l} href={langHref(l)} data-active={l === cl ? '' : undefined}>
                {langLabel(l)}
              </a>
            )
          )}
        </nav>
      )}
    </div>
  )

  const countdownTone = coverUrl
    ? 'light'
    : heroVariant === 'split'
      ? 'dark'
      : flatHero
        ? 'dark'
        : 'light'

  // Hero content shared by the classic and split layouts.
  const heroBody = (
    <>
      {hero.show_chip !== false && (
        <span
          className={hero.chip_style === 'text' ? styles.heroChipPlain : styles.heroChip}
          style={
            hero.chip_style === 'text'
              ? hero.chip_text
                ? { color: hero.chip_text }
                : undefined
              : {
                  ...(chipBg ? { background: chipBg, borderColor: chipBg } : {}),
                  ...(hero.chip_text ? { color: hero.chip_text } : {}),
                }
          }
        >
          {formatEventDateRange(event.starts_at, event.ends_at, event.timezone, locale)}
          {location ? ` · ${location}` : ''}
        </span>
      )}
      <h1 className={styles.heroTitle} style={titleStyle}>
        {name}
      </h1>
      {description && (
        <p
          className={styles.heroDescription}
          style={theme.desc_color ? { color: theme.desc_color } : undefined}
        >
          {description}
        </p>
      )}
      <div className={styles.heroActions}>
        {closed ? (
          <p className={styles.heroNotice}>{t('registrationClosed')}</p>
        ) : notOpenYet ? (
          <p className={styles.heroNotice}>
            {t('registrationNotOpen', {
              date: formatEventDate(event.registration_opens_at, event.timezone, locale),
            })}
          </p>
        ) : (
          registerButton
        )}
        {showAgenda && agenda.show_hero_button !== false && (
          <a className={`btn ${styles.heroGhostBtn}`} href="#agenda">
            {t('viewAgenda')}
          </a>
        )}
      </div>
      {hero.show_countdown !== false && !closed && countdownTarget && (
        <div className={styles.heroCountdown}>
          <Countdown
            targetIso={countdownTarget}
            tone={countdownTone}
            label={t('countdownLabel')}
            variant={hero.countdown_style || 'minimal'}
            color={hero.countdown_color}
          />
        </div>
      )}
    </>
  )

  // Each body section keyed for order-driven rendering. Values are false-y when
  // the section is hidden; the render loop skips those.
  const sectionNodes = {
    about: showAbout && (
      <Section section="about" className={styles.about} style={sectionBg(about)} {...sectionProps}>
        <div className={`container ${styles.aboutGrid}`}>
          <div className={styles.aboutText}>
            {heading(about, t('aboutDefault'))}
            {L(about.body) && <p className={styles.aboutBody}>{L(about.body)}</p>}
            {about.stats?.length > 0 && (
              <div className={styles.stats}>
                {about.stats.map((s, i) => {
                  const hi = s.highlighted && s.highlight_color
                  return (
                    <div
                      key={i}
                      className={`${styles.stat} ${s.highlighted ? styles.statHighlight : ''}`}
                      style={hi ? { background: s.highlight_color, borderColor: s.highlight_color } : undefined}
                    >
                      {(s.icon_path || s.icon) && (
                        <span className={styles.statIcon}>
                          {s.icon_path ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={eventMediaUrl(s.icon_path)} alt="" />
                          ) : (
                            <StatIcon name={s.icon} />
                          )}
                        </span>
                      )}
                      <span className={styles.statText}>
                        <strong>{s.value}</strong>
                        <span>{L(s.label)}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {(aboutVideo || about.image_path) && (
            <div className={styles.aboutMedia} data-video={aboutVideo ? '' : undefined}>
              {aboutVideo?.type === 'iframe' ? (
                <iframe
                  src={aboutVideo.src}
                  title="video"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : aboutVideo?.type === 'video' ? (
                /* eslint-disable-next-line jsx-a11y/media-has-caption */
                <video src={aboutVideo.src} controls playsInline />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={eventMediaUrl(about.image_path)} alt="" style={imgAdjust(about)} />
              )}
            </div>
          )}
        </div>
      </Section>
    ),

    speakers: showSpeakers && (
      <Section section="speakers" className={styles.speakers} style={sectionBg(speakers)} {...sectionProps}>
        <div className="container">
          {heading(speakers, t('speakersDefault'))}
          <div className={styles.speakerGrid}>
            {speakers.items.map((sp) => (
              <div key={sp.id} className={styles.speakerCard}>
                {sp.photo_path ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={eventMediaUrl(sp.photo_path)} alt={sp.name} />
                ) : (
                  <div className={styles.speakerPlaceholder} aria-hidden="true">
                    {sp.name?.charAt(0) ?? '?'}
                  </div>
                )}
                <div className={styles.speakerInfo}>
                  <strong>{sp.name}</strong>
                  {L(sp.role) && (
                    <span
                      className={styles.speakerRole}
                      style={speakers.role_color ? { color: speakers.role_color } : undefined}
                    >
                      {L(sp.role)}
                    </span>
                  )}
                  {sp.org && <span className={styles.speakerOrg}>{sp.org}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>
    ),

    tracks: (
      <TracksSection
        content={tracks}
        locale={locale}
        defaultLocale={dl}
        editable={editable}
        onEditSection={onEditSection}
      />
    ),

    agenda: showAgenda && (
      <Section id="agenda" section="agenda" className={styles.agenda} style={sectionBg(agenda)} {...sectionProps}>
        <div className="container-narrow">
          {heading(agenda, t('agendaDefault'), true)}
          {agenda.image_path && (
            <div className={styles.agendaMedia}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={eventMediaUrl(agenda.image_path)} alt="" style={imgAdjust(agenda)} />
            </div>
          )}
          {agenda.items?.length > 0 && (
            <ol className={styles.agendaList}>
              {agenda.items.map((item) => (
                <li key={item.id} className={styles.agendaItem}>
                  <div className={styles.agendaMarker} aria-hidden="true" />
                  <div className={styles.agendaBody}>
                    <h3>{L(item.title)}</h3>
                    {L(item.time) && <p className={styles.agendaTime}>{L(item.time)}</p>}
                    {L(item.description) && <p>{L(item.description)}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Section>
    ),

    testimonials: (
      <TestimonialsSection
        content={testimonials}
        locale={locale}
        defaultLocale={dl}
        editable={editable}
        onEditSection={onEditSection}
      />
    ),

    gallery: (
      <GallerySection
        content={gallery}
        locale={locale}
        defaultLocale={dl}
        editable={editable}
        onEditSection={onEditSection}
      />
    ),

    tickets: showTickets && (
      <Section id="tickets" section="tickets" className={styles.tickets} style={sectionBg(tickets)} {...sectionProps}>
        <div className="container">
          {heading(tickets, t('ticketsDefault'), true)}
          <div className={styles.tierGrid}>
            {tickets.items.map((tier) => {
              const highlightStyle =
                tier.highlighted && tickets.highlight_color
                  ? { background: tickets.highlight_color, borderColor: tickets.highlight_color }
                  : undefined
              return (
                <div
                  key={tier.id}
                  className={`${styles.tier} ${tier.highlighted ? styles.tierHighlight : ''}`}
                  style={highlightStyle}
                >
                  {L(tier.badge) && <span className={styles.tierBadge}>{L(tier.badge)}</span>}
                  <span className={styles.tierName}>{L(tier.name)}</span>
                  <span className={styles.tierPrice}>{tier.price}</span>
                  {L(tier.features) && (
                    <ul className={styles.tierFeatures}>
                      {L(tier.features)
                        .split('\n')
                        .filter((f) => f.trim())
                        .map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                    </ul>
                  )}
                  {!closed && !notOpenYet && registerButton}
                </div>
              )
            })}
          </div>
        </div>
      </Section>
    ),

    faq: (
      <FaqSection
        content={faq}
        locale={locale}
        defaultLocale={dl}
        editable={editable}
        onEditSection={onEditSection}
      />
    ),

    map: (
      <MapSection
        content={mapSection}
        locale={locale}
        defaultLocale={dl}
        editable={editable}
        onEditSection={onEditSection}
      />
    ),

    contact: hasContact && (
      <Section section="contact" className={styles.contact} style={sectionBg(contactSection)} {...sectionProps}>
        <div className={`container-narrow ${styles.contactInner}`}>
          {heading(contactSection, t('contact'))}
          <div className={styles.contactList}>
            {contact.name && <span>{contact.name}</span>}
            {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
            {contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}
            {contact.website && (
              <a href={contact.website} target="_blank" rel="noreferrer">
                {contact.website}
              </a>
            )}
          </div>
        </div>
      </Section>
    ),
  }

  const sectionOrder = resolveSectionOrder(content)

  return (
    <div
      className={styles.page}
      style={pageStyle}
      data-custom-bg={theme.page_bg ? '' : undefined}
      data-custom-text={theme.text_color ? '' : undefined}
      data-scale={theme.text_scale && theme.text_scale !== 'normal' ? theme.text_scale : undefined}
      data-radius={theme.radius && theme.radius !== 'normal' ? theme.radius : undefined}
      data-width={theme.width && theme.width !== 'normal' ? theme.width : undefined}
      data-density={theme.density && theme.density !== 'normal' ? theme.density : undefined}
      data-btn-style={theme.btn_style && theme.btn_style !== 'fill' ? theme.btn_style : undefined}
    >
      {/* ---- Hero ---- */}
      {heroVariant === 'split' ? (
        <Section section="hero" className={styles.heroSplit} {...sectionProps}>
          {!logoAtBottom && heroTopBar}
          <div className={`container ${styles.heroSplitInner}`}>
            <div className={styles.heroSplitText}>{heroBody}</div>
            <div className={styles.heroSplitMedia}>
              {coverUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={coverUrl} alt="" style={imgAdjust(hero, 'cover')} />
              ) : (
                <div className={styles.heroSplitPlaceholder} aria-hidden="true" />
              )}
            </div>
          </div>
          {logoAtBottom && heroTopBar}
        </Section>
      ) : (
        <Section
          section="hero"
          className={styles.hero}
          style={heroStyle}
          dataFlat={flatHero}
          {...sectionProps}
        >
          {coverUrl && (
            <div
              className={styles.heroBg}
              data-custom-overlay={heroTint ? '' : undefined}
              aria-hidden="true"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl} alt="" style={imgAdjust(hero, 'cover')} />
            </div>
          )}
          {coverUrl && heroTint && (
            <div className={styles.heroTint} style={{ background: heroTint }} aria-hidden="true" />
          )}
          {!logoAtBottom && heroTopBar}
          <div
            className={`container ${styles.heroInner}`}
            data-align={theme.title_align || undefined}
          >
            {heroBody}
          </div>
          {logoAtBottom && heroTopBar}
        </Section>
      )}

      {/* Body sections, in the organizer-configured order */}
      {sectionOrder.map((key) => (
        <Fragment key={key}>{sectionNodes[key]}</Fragment>
      ))}

    </div>
  )
}

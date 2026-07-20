'use client'

import { useTranslations } from 'next-intl'
import { lt } from '@/lib/i18n/locales'
import { formatEventDate, formatEventDateRange } from '@/lib/dates'
import { eventMediaUrl } from '@/lib/storage'
import styles from './event-page-view.module.css'

// Style options shared with the console editor.
export const HEADING_SIZES = {
  sm: '1.25rem',
  md: '1.75rem',
  lg: '2.375rem',
  xl: '3rem',
}

export const TITLE_SIZES = {
  sm: '1.6rem',
  md: 'clamp(2rem, 5vw, 3rem)',
  lg: 'clamp(2.5rem, 6vw, 3.75rem)',
  xl: 'clamp(3rem, 7vw, 4.5rem)',
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

function textStyle(hs = {}, sizes = HEADING_SIZES) {
  const style = {}
  if (hs.color) style.color = hs.color
  if (hs.size && sizes[hs.size]) style.fontSize = sizes[hs.size]
  if (hs.font && FONT_FAMILIES[hs.font]) style.fontFamily = FONT_FAMILIES[hs.font]
  return style
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
export function EventPageView({ event, locale, registerHref, editable = false, onEditSection }) {
  const t = useTranslations('event')
  const content = event.page_content ?? {}
  const dl = event.default_locale

  const L = (map) => lt(map, locale, dl)

  const theme = content.theme ?? {}
  const hero = content.hero ?? {}
  const about = content.about ?? {}
  const speakers = content.speakers ?? {}
  const agenda = content.agenda ?? {}
  const tickets = content.tickets ?? {}
  const showAbout = about.enabled && (L(about.body) || about.image_path || about.stats?.length)
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
  if (theme.body_font && FONT_FAMILIES[theme.body_font]) {
    pageStyle.fontFamily = FONT_FAMILIES[theme.body_font]
  }

  const titleStyle = textStyle(
    { color: theme.title_color, size: theme.title_size, font: theme.title_font },
    TITLE_SIZES
  )

  // With no cover image, let the hero adopt the chosen page colors so theme
  // changes are visible at the very top of the page (otherwise it keeps its
  // default pine gradient and looks unaffected).
  const flatHero = !coverUrl && (theme.page_bg || theme.text_color)
  const heroStyle = {}
  if (flatHero) {
    if (theme.page_bg) heroStyle.background = theme.page_bg
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

  return (
    <div
      className={styles.page}
      style={pageStyle}
      data-custom-bg={theme.page_bg ? '' : undefined}
      data-custom-text={theme.text_color ? '' : undefined}
    >
      {/* ---- Hero ---- */}
      <Section
        section="hero"
        className={styles.hero}
        style={heroStyle}
        dataFlat={flatHero}
        {...sectionProps}
      >
        {coverUrl && (
          <div className={styles.heroBg} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="" />
          </div>
        )}
        <div className={`container ${styles.heroInner}`}>
          {hero.show_chip !== false && (
            <span
              className={styles.heroChip}
              style={{
                ...(hero.chip_bg ? { background: hero.chip_bg, borderColor: hero.chip_bg } : {}),
                ...(hero.chip_text ? { color: hero.chip_text } : {}),
              }}
            >
              {formatEventDateRange(event.starts_at, event.ends_at, event.timezone, locale)}
              {location ? ` · ${location}` : ''}
            </span>
          )}
          <h1 className={styles.heroTitle} style={titleStyle}>
            {name}
          </h1>
          {description && <p className={styles.heroDescription}>{description}</p>}
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
            {showAgenda && (
              <a className={`btn ${styles.heroGhostBtn}`} href="#agenda">
                {t('viewAgenda')}
              </a>
            )}
          </div>
        </div>
      </Section>

      {/* ---- About ---- */}
      {showAbout && (
        <Section section="about" className={styles.about} {...sectionProps}>
          <div className={`container ${styles.aboutGrid}`}>
            <div className={styles.aboutText}>
              {heading(about, t('aboutDefault'))}
              {L(about.body) && <p className={styles.aboutBody}>{L(about.body)}</p>}
              {about.stats?.length > 0 && (
                <div className={styles.stats}>
                  {about.stats.map((s, i) => (
                    <div key={i} className={styles.stat}>
                      <strong>{s.value}</strong>
                      <span>{L(s.label)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {about.image_path && (
              <div className={styles.aboutMedia}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={eventMediaUrl(about.image_path)} alt="" />
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ---- Speakers ---- */}
      {showSpeakers && (
        <Section section="speakers" className={styles.speakers} {...sectionProps}>
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
                    {L(sp.role) && <span className={styles.speakerRole}>{L(sp.role)}</span>}
                    {sp.org && <span className={styles.speakerOrg}>{sp.org}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* ---- Agenda ---- */}
      {showAgenda && (
        <Section id="agenda" section="agenda" className={styles.agenda} {...sectionProps}>
          <div className="container-narrow">
            {heading(agenda, t('agendaDefault'), true)}
            {agenda.image_path && (
              <div className={styles.agendaMedia}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={eventMediaUrl(agenda.image_path)} alt="" />
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
      )}

      {/* ---- Tickets ---- */}
      {showTickets && (
        <Section id="tickets" section="tickets" className={styles.tickets} {...sectionProps}>
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
      )}

      {/* ---- Contact ---- */}
      {hasContact && (
        <Section section="contact" className={styles.contact} {...sectionProps}>
          <div className={`container-narrow ${styles.contactInner}`}>
            <h2 className={styles.sectionTitle}>{t('contact')}</h2>
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
      )}
    </div>
  )
}

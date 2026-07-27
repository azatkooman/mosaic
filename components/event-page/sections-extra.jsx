'use client'

import { useTranslations } from 'next-intl'
import { lt } from '@/lib/i18n/locales'
import { eventMediaUrl } from '@/lib/storage'
import { textStyle } from './text-style'
import { videoEmbedSrc, mapEmbedSrc } from './video'
import styles from './sections-extra.module.css'

/*
 * Optional event-page sections. Each one is self-contained and self-gating:
 * it reads its slice of `page_content`, renders nothing unless the organizer
 * enabled it AND it has content, and (when editable) shows the hover pencil in
 * the exact same way as the built-in sections.
 *
 * Data shapes (all stored inside events.page_content — no DB migration):
 *   tracks:       { enabled, heading, heading_style, bg, items:[{id,title,body,color}] }
 *   testimonials: { enabled, heading, heading_style, bg, items:[{id,quote,author,role}] }
 *   gallery:      { enabled, heading, heading_style, bg, items:[{id,image_path}] }
 *   faq:          { enabled, heading, heading_style, bg, items:[{id,question,answer}] }
 *   map:          { enabled, heading, heading_style, bg, address, embed_url, image_path }
 *
 * Localized fields (title/body/heading/quote/role/question/answer/address) are
 * {en,es,...} maps resolved with lt(); plain strings (color, author,
 * image_path, embed_url) are stored as-is.
 */

const TRACK_COLORS = ['#3d7ea6', '#e8a33d', '#e2725b', '#146b5c']

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

// Mirrors the built-in Section wrapper (hover outline + edit pencil).
function Editable({ id, section, className, style, editable, onEditSection, editLabel, children }) {
  return (
    <section
      id={id}
      className={`${className ?? ''} ${editable ? styles.editable : ''}`}
      style={style}
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

function useSectionProps(editable, onEditSection) {
  const t = useTranslations('event')
  return { editable, onEditSection, editLabel: t('edit') }
}

function Heading({ text, style, centered, defaultAlign }) {
  const align = style?.textAlign || defaultAlign || (centered ? 'center' : undefined)
  return (
    <h2
      className={styles.title}
      style={{
        ...style,
        ...(align ? { textAlign: align } : {}),
      }}
    >
      {text}
    </h2>
  )
}

const headingStyle = (hs) => textStyle(hs ?? {})

/* ---------------- Tracks ---------------- */

export function TracksSection({ content = {}, locale, defaultLocale, editable, onEditSection, defaultAlign }) {
  const t = useTranslations('event')
  const sp = useSectionProps(editable, onEditSection)
  const L = (m) => lt(m, locale, defaultLocale)
  const items = content.items ?? []
  if (!content.enabled || items.length === 0) return null

  return (
    <Editable
      section="tracks"
      className={styles.tracks}
      style={content.bg ? { background: content.bg } : undefined}
      {...sp}
    >
      <div className="container">
        <Heading text={L(content.heading) || t('tracksDefault')} style={headingStyle(content.heading_style)} defaultAlign={defaultAlign} />
        <div className={styles.trackGrid}>
          {items.map((it, i) => {
            const color = it.color || TRACK_COLORS[i % TRACK_COLORS.length]
            return (
              <div key={it.id} className={styles.trackCard} style={{ borderTopColor: color }}>
                <span className={styles.trackIndex} style={{ color }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className={styles.trackName}>{L(it.title)}</h3>
                {L(it.body) && <p className={styles.trackBody}>{L(it.body)}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </Editable>
  )
}

/* ---------------- Testimonials ---------------- */

export function TestimonialsSection({ content = {}, locale, defaultLocale, editable, onEditSection, defaultAlign }) {
  const sp = useSectionProps(editable, onEditSection)
  const L = (m) => lt(m, locale, defaultLocale)
  const items = content.items ?? []
  if (!content.enabled || items.length === 0) return null

  // The heading is optional here: no text → no heading at all.
  const headingText = L(content.heading)
  const minimal = content.layout === 'quote'

  return (
    <Editable
      section="testimonials"
      className={styles.testimonials}
      style={content.bg ? { background: content.bg } : undefined}
      {...sp}
    >
      <div className="container">
        {headingText && (
          <Heading text={headingText} style={headingStyle(content.heading_style)} centered defaultAlign={defaultAlign} />
        )}
        {minimal ? (
          <div className={styles.quoteMinimalList}>
            {items.map((it) => (
              <figure key={it.id} className={styles.quoteMinimal}>
                <blockquote>&ldquo;{L(it.quote)}&rdquo;</blockquote>
                {(it.author || L(it.role)) && (
                  <figcaption>
                    {[it.author, L(it.role)].filter(Boolean).join(' · ')}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        ) : (
          <div className={styles.quoteGrid}>
            {items.map((it) => (
              <figure key={it.id} className={styles.quoteCard} style={content.card_bg ? { background: content.card_bg } : undefined}>
                <blockquote className={styles.quoteText}>{L(it.quote)}</blockquote>
                <figcaption className={styles.quoteMeta}>
                  {it.author && <strong>{it.author}</strong>}
                  {L(it.role) && <span>{L(it.role)}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </Editable>
  )
}

/* ---------------- Gallery ---------------- */

export function GallerySection({ content = {}, locale, defaultLocale, editable, onEditSection, defaultAlign }) {
  const t = useTranslations('event')
  const sp = useSectionProps(editable, onEditSection)
  const L = (m) => lt(m, locale, defaultLocale)
  const items = (content.items ?? []).filter((it) => it.image_path || videoEmbedSrc(it.video_url))
  if (!content.enabled || items.length === 0) return null

  return (
    <Editable
      section="gallery"
      className={styles.gallery}
      style={content.bg ? { background: content.bg } : undefined}
      {...sp}
    >
      <div className="container">
        <Heading text={L(content.heading) || t('galleryDefault')} style={headingStyle(content.heading_style)} defaultAlign={defaultAlign} />
        <div className={styles.galleryGrid}>
          {items.map((it, i) => {
            const video = videoEmbedSrc(it.video_url)
            return (
              <div key={it.id} className={styles.galleryItem} data-feature={i === 0 ? '' : undefined}>
                {video?.type === 'iframe' ? (
                  <iframe
                    src={video.src}
                    title="video"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : video?.type === 'video' ? (
                  /* eslint-disable-next-line jsx-a11y/media-has-caption */
                  <video src={video.src} controls playsInline />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={eventMediaUrl(it.image_path)} alt="" loading="lazy" />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Editable>
  )
}

/* ---------------- FAQ ---------------- */

export function FaqSection({ content = {}, locale, defaultLocale, editable, onEditSection, defaultAlign }) {
  const t = useTranslations('event')
  const sp = useSectionProps(editable, onEditSection)
  const L = (m) => lt(m, locale, defaultLocale)
  const items = content.items ?? []
  if (!content.enabled || items.length === 0) return null

  return (
    <Editable
      section="faq"
      className={styles.faq}
      style={content.bg ? { background: content.bg } : undefined}
      {...sp}
    >
      <div className="container-narrow">
        <Heading
          text={L(content.heading) || t('faqDefault')}
          style={headingStyle(content.heading_style)}
          centered
          defaultAlign={defaultAlign}
        />
        <div className={styles.faqList}>
          {items.map((it) => (
            <details key={it.id} className={styles.faqItem}>
              <summary className={styles.faqQ}>
                {L(it.question)}
                <span className={styles.faqChevron} aria-hidden="true" />
              </summary>
              {L(it.answer) && <p className={styles.faqA}>{L(it.answer)}</p>}
            </details>
          ))}
        </div>
      </div>
    </Editable>
  )
}

/* ---------------- Map / Location ---------------- */

export function MapSection({ content = {}, locale, defaultLocale, editable, onEditSection, defaultAlign }) {
  const t = useTranslations('event')
  const sp = useSectionProps(editable, onEditSection)
  const L = (m) => lt(m, locale, defaultLocale)
  const address = L(content.address)
  // Any pasted maps link (or just the address) becomes an iframe-safe embed.
  const embedSrc = mapEmbedSrc(content.embed_url, address)
  const hasMedia = embedSrc || content.image_path
  if (!content.enabled || (!address && !hasMedia)) return null

  return (
    <Editable
      section="map"
      className={styles.map}
      style={content.bg ? { background: content.bg } : undefined}
      {...sp}
    >
      <div className="container">
        <Heading text={L(content.heading) || t('mapDefault')} style={headingStyle(content.heading_style)} defaultAlign={defaultAlign} />
        <div className={styles.mapGrid}>
          <div className={styles.mapText}>
            {address && <p className={styles.mapAddress}>{address}</p>}
          </div>
          <div className={styles.mapMedia}>
            {embedSrc ? (
              <iframe
                title={t('mapDefault')}
                src={embedSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            ) : content.image_path ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={eventMediaUrl(content.image_path)} alt="" />
            ) : null}
          </div>
        </div>
      </div>
    </Editable>
  )
}

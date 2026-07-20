'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/lib/i18n/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n/locales'
import { eventMediaUrl } from '@/lib/storage'
import { Button, CheckboxRow, Field, Input, NativeSelect, Textarea } from '@/components/ui'
import { EventPageView, FONT_CHOICES } from '@/components/event-page/EventPageView'
import { StatIcon, STAT_ICON_KEYS } from '@/components/event-page/stat-icons'
import styles from './event-page.module.css'

const SECTIONS = ['theme', 'basics', 'hero', 'about', 'speakers', 'agenda', 'tickets', 'contact']
const SIZE_OPTIONS = ['', 'sm', 'md', 'lg', 'xl']

function newId() {
  return Math.random().toString(36).slice(2, 10)
}

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDark(media.matches)
    const listener = (e) => setIsDark(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])
  return isDark
}

// These editors are defined at module scope ON PURPOSE: declaring components
// inside EventPageEditor gives them a new identity on every render, which
// makes React remount them — and any focused input loses focus after each
// keystroke.

// The swatch stages a pending color; "Add color" applies it to the page.
function ColorField({ label, addLabel, resetLabel, value, defaultValue, onChange }) {
  const [pending, setPending] = useState(value ?? defaultValue)
  useEffect(() => {
    setPending(value ?? defaultValue)
  }, [value, defaultValue])
  const applied = (value ?? defaultValue) === pending && value != null
  return (
    <div className={styles.colorField}>
      <span className="field-label">{label}</span>
      <div className={styles.panelRow}>
        <input
          type="color"
          className={styles.colorInput}
          value={pending}
          onChange={(e) => setPending(e.target.value)}
        />
        <Button size="sm" onClick={() => onChange(pending)} disabled={applied}>
          {addLabel}
        </Button>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            {resetLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

function FontSelect({ t, value, onChange }) {
  return (
    <NativeSelect
      value={value ?? 'default'}
      onChange={(e) => onChange(e.target.value === 'default' ? undefined : e.target.value)}
      aria-label={t('fontFamily')}
    >
      {FONT_CHOICES.map((c) => (
        <option key={c.key} value={c.key} style={c.family ? { fontFamily: c.family } : undefined}>
          {c.label ?? t('fontType')}
        </option>
      ))}
    </NativeSelect>
  )
}

function StyleSelects({ t, style = {}, onChange }) {
  return (
    <div className={styles.styleSelects}>
      <NativeSelect
        value={style.size ?? ''}
        onChange={(e) => onChange({ ...style, size: e.target.value || undefined })}
        aria-label={t('fontSize')}
      >
        {SIZE_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s === '' ? t('fontSize') : t(`size_${s}`)}
          </option>
        ))}
      </NativeSelect>
      <FontSelect
        t={t}
        value={style.font}
        onChange={(font) => onChange({ ...style, font })}
      />
    </div>
  )
}

function HeadingStyleEditor({ t, previewLocale, data = {}, defaultHeading, onPatch }) {
  const hs = data.heading_style ?? {}
  const setStyle = (next) => onPatch({ heading_style: next })
  const isDark = useIsDarkMode()
  return (
    <div className={styles.headingEditor}>
      <Field label={`${t('heading')} (${previewLocale})`}>
        {({ id }) => (
          <Input
            id={id}
            placeholder={defaultHeading}
            value={data.heading?.[previewLocale] ?? ''}
            onChange={(e) =>
              onPatch({ heading: { ...(data.heading ?? {}), [previewLocale]: e.target.value } })
            }
          />
        )}
      </Field>
      <StyleSelects t={t} style={hs} onChange={setStyle} />
      <ColorField
        label={t('headingColor')}
        addLabel={t('addColor')}
        resetLabel={t('resetColor')}
        value={hs.color}
        defaultValue={isDark ? '#ffffff' : '#000000'}
        onChange={(color) => setStyle({ ...hs, color: color ?? undefined })}
      />
    </div>
  )
}

function SectionHeader({ title, toggleLabel, enabled, onToggle }) {
  return (
    <div className={styles.panelSectionHead}>
      <h3>{title}</h3>
      {onToggle && (
        <CheckboxRow label={toggleLabel} checked={enabled} onCheckedChange={onToggle} />
      )}
    </div>
  )
}

export function EventPageEditor({ initialEvent }) {
  const t = useTranslations('console')
  const uiLocale = useLocale()
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()
  const isDark = useIsDarkMode()

  const [event, setEvent] = useState({ page_content: {}, ...initialEvent })
  const [previewLocale, setPreviewLocale] = useState(
    LOCALES.includes(uiLocale) ? uiLocale : initialEvent.default_locale
  )
  const [panelSection, setPanelSection] = useState(null) // null = closed
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState('idle')
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [saveErrorMsg, setSaveErrorMsg] = useState('')
  const coverInputRef = useRef(null)
  const aboutImgInputRef = useRef(null)
  const agendaImgInputRef = useRef(null)
  const speakerInputRef = useRef(null)
  const speakerUploadTarget = useRef(null)
  const statInputRef = useRef(null)
  const statUploadTarget = useRef(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const publicUrl = `${origin}/${previewLocale}/events/${event.slug}`
  const content = event.page_content ?? {}

  // ---- state helpers -------------------------------------------------------

  function markDirty() {
    setDirty(true)
    setSaveState('idle')
  }

  function patchEvent(patch) {
    setEvent((prev) => ({ ...prev, ...patch }))
    markDirty()
  }

  // Functional updates: colors/text can change in quick succession, so always
  // derive from the latest state rather than a value captured at render time.
  function patchContent(section, patch) {
    setEvent((prev) => {
      const pc = prev.page_content ?? {}
      return { ...prev, page_content: { ...pc, [section]: { ...(pc[section] ?? {}), ...patch } } }
    })
    markDirty()
  }

  function patchItem(section, id, patch) {
    setEvent((prev) => {
      const pc = prev.page_content ?? {}
      const items = pc[section]?.items ?? []
      return {
        ...prev,
        page_content: {
          ...pc,
          [section]: {
            ...(pc[section] ?? {}),
            items: items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
          },
        },
      }
    })
    markDirty()
  }

  function addItem(section, item) {
    setEvent((prev) => {
      const pc = prev.page_content ?? {}
      const items = pc[section]?.items ?? []
      return {
        ...prev,
        page_content: {
          ...pc,
          [section]: { ...(pc[section] ?? {}), enabled: true, items: [...items, { id: newId(), ...item }] },
        },
      }
    })
    markDirty()
  }

  function removeItem(section, id) {
    setEvent((prev) => {
      const pc = prev.page_content ?? {}
      const items = pc[section]?.items ?? []
      return {
        ...prev,
        page_content: {
          ...pc,
          [section]: { ...(pc[section] ?? {}), items: items.filter((it) => it.id !== id) },
        },
      }
    })
    markDirty()
  }

  // Localized value helpers — edit the text for the previewed language.
  const lv = (map) => map?.[previewLocale] ?? ''
  const setLv = (map, value) => ({ ...(map ?? {}), [previewLocale]: value })

  // ---- persistence ---------------------------------------------------------

  async function save() {
    setSaveState('saving')
    setSaveErrorMsg('')
    const { error } = await supabase
      .from('events')
      .update({
        name: event.name,
        description: event.description,
        location: event.location,
        contact: event.contact,
        cover_image_path: event.cover_image_path,
        page_content: event.page_content,
        supported_locales: LOCALES.filter((l) => (event.name?.[l] ?? '').trim() !== ''),
      })
      .eq('id', event.id)
    if (error) {
      setSaveState('error')
      // Surface the real cause (e.g. a missing column) instead of a bare icon.
      setSaveErrorMsg(error.message || t('saveError'))
    } else {
      setSaveState('saved')
      setDirty(false)
      router.refresh()
    }
  }

  async function setStatus(status) {
    const { error } = await supabase.from('events').update({ status }).eq('id', event.id)
    if (!error) {
      setEvent((prev) => ({ ...prev, status }))
      router.refresh()
    }
  }

  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

  async function upload(file, prefix) {
    setUploadError('')
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError(t('uploadBadType'))
      return null
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(t('uploadTooLarge'))
      return null
    }
    setUploading((n) => n + 1)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${event.id}/${prefix}-${Date.now().toString(36)}.${ext}`
      const { error } = await supabase.storage.from('event-covers').upload(path, file)
      if (error) {
        setUploadError(error.message || t('uploadFailed'))
        return null
      }
      return path
    } finally {
      setUploading((n) => n - 1)
    }
  }

  async function onCoverFile(e) {
    const file = e.target.files?.[0]
    if (file) {
      const path = await upload(file, 'cover')
      if (path) patchEvent({ cover_image_path: path })
    }
    e.target.value = ''
  }

  async function onAboutImgFile(e) {
    const file = e.target.files?.[0]
    if (file) {
      const path = await upload(file, 'about')
      if (path) patchContent('about', { enabled: true, image_path: path })
    }
    e.target.value = ''
  }

  async function onAgendaImgFile(e) {
    const file = e.target.files?.[0]
    if (file) {
      const path = await upload(file, 'agenda')
      if (path) patchContent('agenda', { enabled: true, image_path: path })
    }
    e.target.value = ''
  }

  async function onStatFile(e) {
    const file = e.target.files?.[0]
    const idx = statUploadTarget.current
    if (file && idx != null) {
      const path = await upload(file, `stat-${idx}`)
      if (path) {
        setEvent((prev) => {
          const pc = prev.page_content ?? {}
          const stats = (pc.about?.stats ?? []).map((x, j) =>
            j === idx ? { ...x, icon_path: path, icon: undefined } : x
          )
          return { ...prev, page_content: { ...pc, about: { ...(pc.about ?? {}), stats } } }
        })
        markDirty()
      }
    }
    e.target.value = ''
  }

  async function onSpeakerFile(e) {
    const file = e.target.files?.[0]
    const id = speakerUploadTarget.current
    if (file && id) {
      const path = await upload(file, `speaker-${id}`)
      if (path) patchItem('speakers', id, { photo_path: path })
    }
    e.target.value = ''
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // URL is visible and selectable anyway.
    }
  }

  // ---- panel section editors ----------------------------------------------

  // Bound builders for the module-scope editor components. Plain functions
  // returning JSX keep the element type stable across renders (no remounts).
  const sectionHeader = (section) => (
    <SectionHeader
      title={t(`section_${section}`)}
      toggleLabel={t('showSection')}
      enabled={!!content[section]?.enabled}
      onToggle={(checked) => patchContent(section, { enabled: !!checked })}
    />
  )

  const headingEditor = (section) => (
    <HeadingStyleEditor
      t={t}
      previewLocale={previewLocale}
      data={content[section]}
      defaultHeading={t(`section_${section}`)}
      onPatch={(patch) => patchContent(section, patch)}
    />
  )

  // Per-section background color control (About / Speakers / Agenda / Tickets / Contact).
  const HEADING_SECTIONS = ['about', 'speakers', 'agenda', 'tickets']

  const sectionBgField = (section) => (
    <ColorField
      label={t('sectionBackground')}
      addLabel={t('addColor')}
      resetLabel={t('resetColor')}
      value={content[section]?.bg}
      defaultValue={isDark ? '#111111' : '#ffffff'}
      onChange={(c) => patchContent(section, { bg: c ?? undefined })}
    />
  )

  // Set every section heading to one color in a single update.
  function applyColorToAllHeadings(color) {
    if (!color) return
    setEvent((prev) => {
      const pc = prev.page_content ?? {}
      const next = { ...pc }
      for (const sec of HEADING_SECTIONS) {
        const s = pc[sec] ?? {}
        next[sec] = { ...s, heading_style: { ...(s.heading_style ?? {}), color } }
      }
      return { ...prev, page_content: next }
    })
    markDirty()
  }

  function renderTheme() {
    const theme = content.theme ?? {}
    const setTheme = (patch) => patchContent('theme', patch)
    return (
      <>
        <div className={styles.colorPair}>
          <ColorField
            label={t('pageBackground')}
            addLabel={t('addColor')}
            resetLabel={t('resetColor')}
            value={theme.page_bg}
            defaultValue={isDark ? '#000000' : '#ffffff'}
            onChange={(c) => setTheme({ page_bg: c ?? undefined })}
          />
          <ColorField
            label={t('textColor')}
            addLabel={t('addColor')}
            resetLabel={t('resetColor')}
            value={theme.text_color}
            defaultValue={isDark ? '#ffffff' : '#000000'}
            onChange={(c) => setTheme({ text_color: c ?? undefined })}
          />
        </div>
        <div className={styles.colorField}>
          <span className="field-label">{t('pageFont')}</span>
          <FontSelect t={t} value={theme.body_font} onChange={(f) => setTheme({ body_font: f })} />
        </div>
        <h4 className={styles.panelSubhead}>{t('heroTitleStyle')}</h4>
        <ColorField
          label={t('heroBackground')}
          addLabel={t('addColor')}
          resetLabel={t('resetColor')}
          value={theme.hero_bg}
          defaultValue={isDark ? '#000000' : '#ffffff'}
          onChange={(c) => setTheme({ hero_bg: c ?? undefined })}
        />
        {theme.hero_bg && (
          <div className={styles.colorField}>
            <span className="field-label">
              {t('heroOpacity')}: {theme.hero_opacity ?? 100}%
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={theme.hero_opacity ?? 100}
              onChange={(e) => setTheme({ hero_opacity: Number(e.target.value) })}
            />
          </div>
        )}
        <ColorField
          label={t('titleColor')}
          addLabel={t('addColor')}
          resetLabel={t('resetColor')}
          value={theme.title_color}
          defaultValue={isDark ? '#ffffff' : '#000000'}
          onChange={(c) => setTheme({ title_color: c ?? undefined })}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!theme.title_color}
          onClick={() => applyColorToAllHeadings(theme.title_color)}
        >
          {t('applyToAllTitles')}
        </Button>
        <StyleSelects
          t={t}
          style={{ size: theme.title_size, font: theme.title_font }}
          onChange={(s) => setTheme({ title_size: s.size, title_font: s.font })}
        />
        <div className={styles.colorField}>
          <span className="field-label">{t('titleAlign')}</span>
          <NativeSelect
            value={theme.title_align ?? 'left'}
            onChange={(e) => setTheme({ title_align: e.target.value })}
          >
            <option value="left">{t('alignLeft')}</option>
            <option value="center">{t('alignCenter')}</option>
            <option value="right">{t('alignRight')}</option>
          </NativeSelect>
        </div>
        <h4 className={styles.panelSubhead}>{t('registerButtonStyle')}</h4>
        <div className={styles.colorPair}>
          <ColorField
            label={t('buttonBackground')}
            addLabel={t('addColor')}
            resetLabel={t('resetColor')}
            value={theme.btn_bg}
            defaultValue={isDark ? '#000000' : '#ffffff'}
            onChange={(c) => setTheme({ btn_bg: c ?? undefined })}
          />
          <ColorField
            label={t('buttonTextColor')}
            addLabel={t('addColor')}
            resetLabel={t('resetColor')}
            value={theme.btn_text}
            defaultValue={isDark ? '#ffffff' : '#000000'}
            onChange={(c) => setTheme({ btn_text: c ?? undefined })}
          />
        </div>
      </>
    )
  }

  function renderBasics() {
    return (
      <>
        <Field label={`${t('eventName')} (${previewLocale})`} required>
          {({ id }) => (
            <Input
              id={id}
              value={lv(event.name)}
              onChange={(e) => patchEvent({ name: setLv(event.name, e.target.value) })}
            />
          )}
        </Field>
        <Field label={`${t('description')} (${previewLocale})`} help={t('heroDescriptionHelp')}>
          {({ id }) => (
            <Textarea
              id={id}
              rows={3}
              value={lv(event.description)}
              onChange={(e) => patchEvent({ description: setLv(event.description, e.target.value) })}
            />
          )}
        </Field>
        <ColorField
          label={t('descriptionColor')}
          addLabel={t('addColor')}
          resetLabel={t('resetColor')}
          value={content.theme?.desc_color}
          defaultValue={isDark ? '#ffffff' : '#ffffff'}
          onChange={(c) => patchContent('theme', { desc_color: c ?? undefined })}
        />
        <Field label={`${t('location')} (${previewLocale})`}>
          {({ id }) => (
            <Input
              id={id}
              value={lv(event.location)}
              onChange={(e) => patchEvent({ location: setLv(event.location, e.target.value) })}
            />
          )}
        </Field>
      </>
    )
  }

  function renderHero() {
    const hero = content.hero ?? {}
    return (
      <>
        <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={onCoverFile} />
        {event.cover_image_path && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            className={styles.panelThumb}
            src={eventMediaUrl(event.cover_image_path)}
            alt=""
          />
        )}
        <div className={styles.panelRow}>
          <Button variant="secondary" size="sm" onClick={() => coverInputRef.current?.click()}>
            {event.cover_image_path ? t('changeImage') : t('uploadImage')}
          </Button>
          {event.cover_image_path && (
            <Button variant="ghost" size="sm" onClick={() => patchEvent({ cover_image_path: null })}>
              {t('remove')}
            </Button>
          )}
        </div>
        <p className="field-help">{t('coverHelp')}</p>

        <h4 className={styles.panelSubhead}>{t('dateLocationChip')}</h4>
        <CheckboxRow
          label={t('showDateLocation')}
          checked={hero.show_chip !== false}
          onCheckedChange={(checked) => patchContent('hero', { show_chip: !!checked })}
        />
        {hero.show_chip !== false && (
          <div className={styles.colorPair}>
            <ColorField
              label={t('chipBackground')}
              addLabel={t('addColor')}
              resetLabel={t('resetColor')}
              value={hero.chip_bg}
              defaultValue={isDark ? '#000000' : '#ffffff'}
              onChange={(c) => patchContent('hero', { chip_bg: c ?? undefined })}
            />
            <ColorField
              label={t('chipTextColor')}
              addLabel={t('addColor')}
              resetLabel={t('resetColor')}
              value={hero.chip_text}
              defaultValue={isDark ? '#ffffff' : '#000000'}
              onChange={(c) => patchContent('hero', { chip_text: c ?? undefined })}
            />
          </div>
        )}
        {hero.show_chip !== false && hero.chip_bg && (
          <div className={styles.colorField}>
            <span className="field-label">
              {t('chipOpacity')}: {hero.chip_bg_opacity ?? 100}%
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={hero.chip_bg_opacity ?? 100}
              onChange={(e) => patchContent('hero', { chip_bg_opacity: Number(e.target.value) })}
            />
          </div>
        )}
      </>
    )
  }

  function renderAbout() {
    const about = content.about ?? {}
    return (
      <>
        {sectionHeader('about')}
        {headingEditor('about')}
        {sectionBgField('about')}
        <Field label={`${t('body')} (${previewLocale})`}>
          {({ id }) => (
            <Textarea
              id={id}
              rows={6}
              value={lv(about.body)}
              onChange={(e) => patchContent('about', { body: setLv(about.body, e.target.value) })}
            />
          )}
        </Field>
        <input ref={aboutImgInputRef} type="file" accept="image/*" hidden onChange={onAboutImgFile} />
        {about.image_path && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className={styles.panelThumb} src={eventMediaUrl(about.image_path)} alt="" />
        )}
        <div className={styles.panelRow}>
          <Button variant="secondary" size="sm" onClick={() => aboutImgInputRef.current?.click()}>
            {about.image_path ? t('changeImage') : t('uploadImage')}
          </Button>
          {about.image_path && (
            <Button variant="ghost" size="sm" onClick={() => patchContent('about', { image_path: null })}>
              {t('remove')}
            </Button>
          )}
        </div>

        <h4 className={styles.panelSubhead}>{t('stats')}</h4>
        <p className="field-help">{t('statsHelp')}</p>
        <input ref={statInputRef} type="file" accept="image/*" hidden onChange={onStatFile} />
        {(about.stats ?? []).map((s, i) => {
          const updateStat = (patch) =>
            patchContent('about', {
              stats: about.stats.map((x, j) => (j === i ? { ...x, ...patch } : x)),
            })
          return (
            <div key={i} className={styles.panelItem}>
              <div className={styles.statNumber} aria-hidden="true">
                {i + 1}
              </div>
              <div className={styles.panelItemFields}>
                <Field label={t('statValue')}>
                  {({ id }) => (
                    <Input
                      id={id}
                      placeholder="50+"
                      value={s.value ?? ''}
                      onChange={(e) => updateStat({ value: e.target.value })}
                    />
                  )}
                </Field>
                <Field label={`${t('statLabel')} (${previewLocale})`}>
                  {({ id }) => (
                    <Input
                      id={id}
                      placeholder={t('statLabelPlaceholder')}
                      value={s.label?.[previewLocale] ?? ''}
                      onChange={(e) =>
                        updateStat({ label: { ...(s.label ?? {}), [previewLocale]: e.target.value } })
                      }
                    />
                  )}
                </Field>

                <span className="field-label">{t('statIcon')}</span>
                <div className={styles.iconPicker}>
                  <button
                    type="button"
                    className={styles.iconOption}
                    data-active={!s.icon && !s.icon_path ? '' : undefined}
                    title={t('iconNone')}
                    onClick={() => updateStat({ icon: undefined, icon_path: undefined })}
                  >
                    ∅
                  </button>
                  {STAT_ICON_KEYS.map((key) => (
                    <button
                      type="button"
                      key={key}
                      className={styles.iconOption}
                      data-active={s.icon === key && !s.icon_path ? '' : undefined}
                      title={key}
                      onClick={() => updateStat({ icon: key, icon_path: undefined })}
                    >
                      <StatIcon name={key} size={20} />
                    </button>
                  ))}
                  {s.icon_path && (
                    <span className={`${styles.iconOption} ${styles.iconUploaded}`} data-active="">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={eventMediaUrl(s.icon_path)} alt="" />
                    </span>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    statUploadTarget.current = i
                    statInputRef.current?.click()
                  }}
                >
                  {s.icon_path ? t('changeImage') : t('uploadIcon')}
                </Button>

                <CheckboxRow
                  label={t('highlightStat')}
                  checked={!!s.highlighted}
                  onCheckedChange={(checked) => updateStat({ highlighted: !!checked })}
                />
                {s.highlighted && (
                  <ColorField
                    label={t('highlightColor')}
                    addLabel={t('addColor')}
                    resetLabel={t('resetColor')}
                    value={s.highlight_color}
                    defaultValue={isDark ? '#ffffff' : '#111111'}
                    onChange={(c) => updateStat({ highlight_color: c ?? undefined })}
                  />
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('remove')}
                onClick={() =>
                  patchContent('about', { stats: about.stats.filter((_, j) => j !== i) })
                }
              >
                ✕
              </Button>
            </div>
          )
        })}
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            patchContent('about', { enabled: true, stats: [...(about.stats ?? []), { value: '', label: {} }] })
          }
        >
          {t('addStat')}
        </Button>
      </>
    )
  }

  function renderSpeakers() {
    const speakers = content.speakers ?? {}
    const items = speakers.items ?? []
    return (
      <>
        {sectionHeader('speakers')}
        {headingEditor('speakers')}
        {sectionBgField('speakers')}
        <ColorField
          label={t('roleColor')}
          addLabel={t('addColor')}
          resetLabel={t('resetColor')}
          value={speakers.role_color}
          defaultValue={isDark ? '#ffffff' : '#000000'}
          onChange={(c) => patchContent('speakers', { role_color: c ?? undefined })}
        />
        <input ref={speakerInputRef} type="file" accept="image/*" hidden onChange={onSpeakerFile} />
        {items.map((sp) => (
          <div key={sp.id} className={styles.panelItem}>
            <div className={styles.panelItemMedia}>
              <button
                type="button"
                className={styles.photoDrop}
                data-has-photo={sp.photo_path ? '' : undefined}
                onClick={() => {
                  speakerUploadTarget.current = sp.id
                  speakerInputRef.current?.click()
                }}
              >
                {sp.photo_path ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={eventMediaUrl(sp.photo_path)} alt="" />
                    <span className={styles.photoOverlay}>{t('changePhoto')}</span>
                  </>
                ) : (
                  <span className={styles.photoPrompt}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
                      <path d="M12 16V5m0 0L8 9m4-4 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                    {t('uploadPhoto')}
                  </span>
                )}
              </button>
              {sp.photo_path && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => patchItem('speakers', sp.id, { photo_path: null })}
                >
                  {t('removePhoto')}
                </Button>
              )}
            </div>
            <div className={styles.panelItemFields}>
              <Input
                placeholder={t('speakerName')}
                value={sp.name ?? ''}
                onChange={(e) => patchItem('speakers', sp.id, { name: e.target.value })}
              />
              <Input
                placeholder={`${t('speakerRole')} (${previewLocale})`}
                value={lv(sp.role)}
                onChange={(e) => patchItem('speakers', sp.id, { role: setLv(sp.role, e.target.value) })}
              />
              <Input
                placeholder={t('speakerOrg')}
                value={sp.org ?? ''}
                onChange={(e) => patchItem('speakers', sp.id, { org: e.target.value })}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => removeItem('speakers', sp.id)}>
              ✕
            </Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => addItem('speakers', { name: '', role: {}, org: '' })}>
          {t('addSpeaker')}
        </Button>
      </>
    )
  }

  function renderAgenda() {
    const agenda = content.agenda ?? {}
    const items = agenda.items ?? []
    return (
      <>
        {sectionHeader('agenda')}
        {headingEditor('agenda')}
        {sectionBgField('agenda')}
        <CheckboxRow
          label={t('showHeroAgendaBtn')}
          checked={agenda.show_hero_button !== false}
          onCheckedChange={(checked) => patchContent('agenda', { show_hero_button: !!checked })}
        />
        <input ref={agendaImgInputRef} type="file" accept="image/*" hidden onChange={onAgendaImgFile} />
        {agenda.image_path && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className={styles.panelThumb} src={eventMediaUrl(agenda.image_path)} alt="" />
        )}
        <div className={styles.panelRow}>
          <Button variant="secondary" size="sm" onClick={() => agendaImgInputRef.current?.click()}>
            {agenda.image_path ? t('changeImage') : t('uploadImage')}
          </Button>
          {agenda.image_path && (
            <Button variant="ghost" size="sm" onClick={() => patchContent('agenda', { image_path: null })}>
              {t('remove')}
            </Button>
          )}
        </div>
        {items.map((it) => (
          <div key={it.id} className={styles.panelItem}>
            <div className={styles.panelItemFields}>
              <Input
                placeholder={`${t('sessionTitle')} (${previewLocale})`}
                value={lv(it.title)}
                onChange={(e) => patchItem('agenda', it.id, { title: setLv(it.title, e.target.value) })}
              />
              <Input
                placeholder={`${t('sessionTime')} (${previewLocale})`}
                value={lv(it.time)}
                onChange={(e) => patchItem('agenda', it.id, { time: setLv(it.time, e.target.value) })}
              />
              <Textarea
                rows={2}
                placeholder={`${t('sessionDescription')} (${previewLocale})`}
                value={lv(it.description)}
                onChange={(e) =>
                  patchItem('agenda', it.id, { description: setLv(it.description, e.target.value) })
                }
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => removeItem('agenda', it.id)}>
              ✕
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => addItem('agenda', { title: {}, time: {}, description: {} })}
        >
          {t('addSession')}
        </Button>
      </>
    )
  }

  function renderTickets() {
    const tickets = content.tickets ?? {}
    const items = tickets.items ?? []
    return (
      <>
        {sectionHeader('tickets')}
        {headingEditor('tickets')}
        {sectionBgField('tickets')}
        <ColorField
          label={t('highlightColor')}
          addLabel={t('addColor')}
          resetLabel={t('resetColor')}
          value={tickets.highlight_color}
          defaultValue={isDark ? '#000000' : '#ffffff'}
          onChange={(c) => patchContent('tickets', { highlight_color: c ?? undefined })}
        />
        {items.map((tier) => (
          <div key={tier.id} className={styles.panelItem}>
            <div className={styles.panelItemFields}>
              <div className={styles.panelRow}>
                <Input
                  placeholder={`${t('tierName')} (${previewLocale})`}
                  value={lv(tier.name)}
                  onChange={(e) => patchItem('tickets', tier.id, { name: setLv(tier.name, e.target.value) })}
                />
                <Input
                  placeholder={t('tierPrice')}
                  value={tier.price ?? ''}
                  onChange={(e) => patchItem('tickets', tier.id, { price: e.target.value })}
                />
              </div>
              <Input
                placeholder={`${t('tierBadge')} (${previewLocale})`}
                value={lv(tier.badge)}
                onChange={(e) => patchItem('tickets', tier.id, { badge: setLv(tier.badge, e.target.value) })}
              />
              <Textarea
                rows={3}
                placeholder={`${t('tierFeatures')} (${previewLocale})`}
                value={lv(tier.features)}
                onChange={(e) =>
                  patchItem('tickets', tier.id, { features: setLv(tier.features, e.target.value) })
                }
              />
              <CheckboxRow
                label={t('highlightTier')}
                checked={!!tier.highlighted}
                onCheckedChange={(checked) => patchItem('tickets', tier.id, { highlighted: !!checked })}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => removeItem('tickets', tier.id)}>
              ✕
            </Button>
          </div>
        ))}
        <p className="field-help">{t('tierFeaturesHelp')}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => addItem('tickets', { name: {}, price: '', badge: {}, features: {}, highlighted: false })}
        >
          {t('addTier')}
        </Button>
      </>
    )
  }

  function renderContact() {
    const contact = event.contact ?? {}
    const set = (key, value) => patchEvent({ contact: { ...contact, [key]: value } })
    return (
      <>
        {sectionBgField('contact')}
        <Field label={t('contactName')}>
          {({ id }) => <Input id={id} value={contact.name ?? ''} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field label={t('contactEmail')}>
          {({ id }) => (
            <Input id={id} type="email" value={contact.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          )}
        </Field>
        <Field label={t('contactPhone')}>
          {({ id }) => (
            <Input id={id} type="tel" value={contact.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          )}
        </Field>
        <Field label={t('contactWebsite')}>
          {({ id }) => (
            <Input id={id} type="url" value={contact.website ?? ''} onChange={(e) => set('website', e.target.value)} />
          )}
        </Field>
      </>
    )
  }

  const sectionRenderers = {
    theme: renderTheme,
    basics: renderBasics,
    hero: renderHero,
    about: renderAbout,
    speakers: renderSpeakers,
    agenda: renderAgenda,
    tickets: renderTickets,
    contact: renderContact,
  }

  return (
    <div className={styles.wrap}>
      {/* ---- toolbar ---- */}
      <section className={`card card-pad ${styles.toolbar}`}>
        <div className={styles.linkRow}>
          <span className={styles.linkLabel}>{t('publicLink')}</span>
          <code className={styles.link}>{publicUrl}</code>
          <div className={styles.linkActions}>
            <Button variant="secondary" size="sm" onClick={copyLink}>
              {copied ? t('linkCopied') : t('copyLink')}
            </Button>
            {event.status === 'published' && (
              <a className="btn btn-secondary btn-sm" href={publicUrl} target="_blank" rel="noreferrer">
                {t('openPage')}
              </a>
            )}
          </div>
        </div>
        {event.status !== 'published' && (
          <p className={`alert alert-info ${styles.draftNote}`}>{t('draftNote')}</p>
        )}
        <div className={styles.previewBar}>
          <Button onClick={() => setPanelSection(panelSection ? null : 'theme')}>
            {t('customize')}
          </Button>
          <p className={styles.hint}>{t('previewHint')}</p>
          <div className={styles.localeSwitch} role="tablist" aria-label="Preview language">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={previewLocale === l}
                data-active={previewLocale === l}
                onClick={() => setPreviewLocale(l)}
              >
                {LOCALE_NAMES[l]}
              </button>
            ))}
          </div>
          <div className={styles.saveStatus} aria-live="polite">
            {saveState === 'saved' && <span className="badge badge-confirmed">{t('saved')}</span>}
            {saveState === 'error' && <span className="badge badge-cancelled">{t('saveError')}</span>}
            {dirty && saveState === 'idle' && (
              <span className="badge">{t('unsavedChanges')}</span>
            )}
          </div>
          {event.status === 'draft' ? (
            <Button variant="secondary" onClick={() => setStatus('published')}>
              {t('publish')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setStatus('draft')}>
              {t('unpublish')}
            </Button>
          )}
          <Button onClick={save} disabled={saveState === 'saving' || !dirty}>
            {t('savePage')}
          </Button>
        </div>
      </section>

      {/* ---- preview + panel ---- */}
      <div className={`${styles.split} ${panelSection ? styles.splitOpen : ''}`}>
        <section className={styles.frame}>
          <EventPageView
            event={event}
            locale={previewLocale}
            editable
            onEditSection={(s) => setPanelSection(s)}
          />
        </section>

        {panelSection && (
          <aside className={styles.panel} aria-label={t('customize')}>
            <div className={styles.panelHead}>
              <h2>{t('customize')}</h2>
              <Button variant="ghost" size="sm" onClick={() => setPanelSection(null)}>
                ✕
              </Button>
            </div>
            <nav className={styles.panelNav}>
              {SECTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-active={panelSection === s}
                  onClick={() => setPanelSection(s)}
                >
                  {t(`section_${s}`)}
                </button>
              ))}
            </nav>
            <div className={styles.panelBody}>
              {uploading > 0 && (
                <p className={`alert alert-info ${styles.uploadNote}`}>{t('uploading')}</p>
              )}
              {uploadError && (
                <p className={`alert alert-error ${styles.uploadNote}`}>{uploadError}</p>
              )}
              {sectionRenderers[panelSection]?.()}
            </div>
            <div className={styles.panelFoot}>
              {saveErrorMsg && (
                <p className={`alert alert-error ${styles.uploadNote}`}>{saveErrorMsg}</p>
              )}
              <Button onClick={save} disabled={saveState === 'saving' || !dirty}>
                {t('savePage')}
              </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

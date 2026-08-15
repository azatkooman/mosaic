'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { eventMediaUrl } from '@/lib/storage'
import { FONT_CHOICES } from '@/components/event-page/text-style'
import { APPEARANCE_OPTIONS, LABEL_SIZES, hasOwnStyle } from '@/lib/form-appearance'
import { setLocalizedText } from '@/lib/form-localization'
import { lt } from '@/lib/i18n/locales'
import { Button, CheckboxRow, Field, NativeSelect, Textarea } from '@/components/ui'
import styles from './builder.module.css'

/**
 * The customize panel for the Forms page tab.
 *
 * Its sections are the register screen's ZONES — header, intro, questions,
 * navigation — and not one section per question, which is the shape the event
 * page uses and the shape this deliberately does not copy. The event page's
 * sections differ because their content differs: speakers hold people, agenda
 * holds days, map holds an address. A form's questions are homogeneous
 * instances of fourteen types, so a list of them would be a second copy of the
 * Questions tab, and styling them one at a time is how you end up with a form
 * where two dropdowns disagree.
 *
 * Questions are therefore styled by TYPE, with a per-question override reached
 * by clicking that question in the preview rather than by hunting for it in a
 * list. One action sets every section heading; the override is there for the
 * one that genuinely needs to differ.
 *
 * A separate component from the builder on purpose: EventPageEditor.jsx is
 * 2,666 lines because its panel grew inside it, and there is no reason to
 * repeat that.
 */

export const ZONES = ['theme', 'header', 'intro', 'questions', 'nav']

export function FormAppearancePanel({
  appearance,
  resolved,
  onChange,
  zone,
  onZoneChange,
  onClose,
  questions,
  selectedQuestionId,
  onSelectQuestion,
  editLocale,
  defaultLocale,
  // Where uploads go — the storage policy gates writes on the {event_id}/
  // folder, so this is what makes the upload allowed at all.
  eventId,
  // The event's hero, offered as "use the event cover" so the two can be kept
  // in step without uploading the same file twice. Null when there is none, and
  // then the button is simply absent rather than present and inert.
  coverImagePath,
}) {
  const t = useTranslations('console')
  const tq = useTranslations('questionTypes')
  const tCommon = useTranslations('common')
  const supabase = getSupabaseBrowserClient()
  const [headerUploading, setHeaderUploading] = useState(false)
  const [headerUploadError, setHeaderUploadError] = useState('')
  const headerFileRef = useRef(null)

  // Each setter patches one branch, so an untouched branch keeps its key order
  // and an unset value stays absent rather than becoming an explicit null —
  // absent is what the resolver reads as "inherit".
  const patch = (branch, values) =>
    onChange({ ...appearance, [branch]: { ...(appearance?.[branch] ?? {}), ...values } })

  const theme = appearance?.theme ?? {}
  // What an unset control is ACTUALLY showing right now, which is the event
  // page's value rather than the platform default. A swatch that shows green
  // beside a form rendering magenta is worse than no swatch: it states, wrongly,
  // that green is what would happen.
  const inherited = resolved?.theme ?? {}
  const header = appearance?.header ?? {}
  const intro = appearance?.intro ?? {}
  const nav = appearance?.nav ?? {}

  const headerImagePath = header.bg_image_path ?? null
  const headerImageUrl = eventMediaUrl(headerImagePath)
  const inheritsCover = !!coverImagePath && headerImagePath === coverImagePath

  // The four the bucket accepts for images (0002/0029). Checked here rather
  // than left to `accept="image/*"` because the attribute is a file-dialog
  // filter, not a guard: drag-and-drop and "All files" both walk past it, and
  // the failure without this is a raw storage 400 in the console.
  const HEADER_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  const HEADER_MAX_BYTES = 5 * 1024 * 1024

  async function onHeaderFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setHeaderUploadError('')
    // Without an event id there is no folder the storage policy would accept,
    // so this would fail at the network rather than here.
    if (!eventId) {
      setHeaderUploadError(t('uploadFailed'))
      return
    }
    if (!HEADER_IMAGE_TYPES.includes(file.type)) {
      setHeaderUploadError(t('uploadBadType'))
      return
    }
    if (file.size > HEADER_MAX_BYTES) {
      setHeaderUploadError(t('uploadTooLarge'))
      return
    }

    setHeaderUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      // Same {event_id}/{prefix}-{ts}.{ext} shape the event page editor uses,
      // which is what lets storage-purge.js sweep the folder on delete.
      const path = `${eventId}/form-header-${Date.now().toString(36)}.${ext}`
      const { error } = await supabase.storage.from('event-covers').upload(path, file)
      if (error) {
        setHeaderUploadError(error.message || t('uploadFailed'))
        return
      }
      patch('header', { bg_image_path: path })
    } finally {
      setHeaderUploading(false)
    }
  }

  // The stored PATH, not a URL: the same value the event carries, so a later
  // change of storage host moves both together.
  function onInheritCover() {
    setHeaderUploadError('')
    if (coverImagePath) patch('header', { bg_image_path: coverImagePath })
  }

  // Deletes the key rather than nulling it. `patch` merges, so it cannot
  // express a removal — and a null here would not be equivalent: absent is what
  // the resolver reads as "no image", and an explicit null would sit in the
  // stored JSON forever as a record of a decision already undone.
  function onRemoveHeader() {
    setHeaderUploadError('')
    const { bg_image_path: _removed, ...rest } = header
    onChange({ ...appearance, header: rest })
  }

  return (
    <aside className={styles.panel} aria-label={t('formCustomize')}>
      <div className={styles.panelHead}>
        <h2>{t('formCustomize')}</h2>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={tCommon('close')}>
          ✕
        </Button>
      </div>

      <div className={styles.panelTabs} role="tablist" aria-label={t('formCustomize')}>
        {ZONES.map((z) => (
          <button
            key={z}
            type="button"
            role="tab"
            aria-selected={zone === z}
            data-active={zone === z}
            onClick={() => onZoneChange(z)}
          >
            {t(`formZone_${z}`)}
          </button>
        ))}
      </div>

      <div className={styles.panelBody}>
        {zone === 'theme' && (
          <>
            <p className={styles.panelNote}>{t('formThemeInherits')}</p>
            <ColorField
              label={t('pageBackground')}
              value={theme.page_bg}
              fallback={inherited.page_bg ?? '#ffffff'}
              clearLabel={t('formInherit')}
              onChange={(v) => patch('theme', { page_bg: v })}
            />
            <ColorField
              label={t('textColor')}
              value={theme.text_color}
              fallback={inherited.text_color ?? '#20242b'}
              clearLabel={t('formInherit')}
              onChange={(v) => patch('theme', { text_color: v })}
            />
            <ColorField
              label={t('primaryColor')}
              value={theme.primary_color}
              fallback={inherited.primary_color ?? '#146b5c'}
              clearLabel={t('formInherit')}
              onChange={(v) => patch('theme', { primary_color: v })}
            />
            <ColorField
              label={t('titleColor')}
              value={theme.title_color}
              fallback={inherited.title_color ?? '#20242b'}
              clearLabel={t('formInherit')}
              onChange={(v) => patch('theme', { title_color: v })}
            />
            <Field label={t('titleFontLabel')}>
              {() => (
                <FontSelect
                  t={t}
                  value={theme.title_font ?? inherited.title_font}
                  onChange={(v) => patch('theme', { title_font: v })}
                />
              )}
            </Field>
            <Field label={t('bodyFontLabel')}>
              {() => (
                <FontSelect
                  t={t}
                  value={theme.body_font ?? inherited.body_font}
                  onChange={(v) => patch('theme', { body_font: v })}
                />
              )}
            </Field>
            <ScaleField
              label={t('textScale')}
              t={t}
              options={APPEARANCE_OPTIONS.text_scale}
              optionKey="scale"
              value={theme.text_scale ?? inherited.text_scale}
              onChange={(v) => patch('theme', { text_scale: v })}
            />
            <ScaleField
              label={t('cornerRadius')}
              t={t}
              options={APPEARANCE_OPTIONS.radius}
              optionKey="radius"
              value={theme.radius ?? inherited.radius}
              onChange={(v) => patch('theme', { radius: v })}
            />
            <ScaleField
              label={t('sectionDensity')}
              t={t}
              options={APPEARANCE_OPTIONS.density}
              optionKey="density"
              value={theme.density ?? inherited.density}
              onChange={(v) => patch('theme', { density: v })}
            />
            <ScaleField
              label={t('contentWidth')}
              t={t}
              options={APPEARANCE_OPTIONS.width}
              optionKey="width"
              value={theme.width ?? inherited.width}
              onChange={(v) => patch('theme', { width: v })}
            />
          </>
        )}

        {zone === 'header' && (
          <>
            <Field
              label={t('headerImage')}
              help={t('headerImageHelp')}
              error={headerUploadError || undefined}
            >
              {({ id, describedBy }) => (
                <div className={styles.panelGroup}>
                  {headerImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element --
                       a Supabase storage URL; see RegisterPreview. */
                    <img className={styles.panelThumb} src={headerImageUrl} alt="" />
                  )}
                  <div className={styles.panelButtonRow}>
                    {/* The Field's own label points at this input, so clicking
                        the label opens the picker — which is why the id comes
                        from Field rather than being invented here. */}
                    <input
                      type="file"
                      id={id}
                      ref={headerFileRef}
                      accept={HEADER_IMAGE_TYPES.join(',')}
                      aria-describedby={describedBy}
                      hidden
                      onChange={onHeaderFile}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={headerUploading}
                      onClick={() => headerFileRef.current?.click()}
                    >
                      {headerUploading
                        ? t('uploading')
                        : headerImagePath
                          ? t('replaceHeaderImage')
                          : t('uploadHeaderImage')}
                    </Button>
                    {/* Absent when there is no cover to inherit, and when the
                        header is already showing it — a button that would
                        re-set the value it already holds reads as broken. */}
                    {coverImagePath && !inheritsCover && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={headerUploading}
                        onClick={onInheritCover}
                      >
                        {t('inheritHeroImage')}
                      </Button>
                    )}
                    {headerImagePath && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={headerUploading}
                        onClick={onRemoveHeader}
                      >
                        {t('removeHeaderImage')}
                      </Button>
                    )}
                  </div>
                  {inheritsCover && <p className={styles.panelNote}>{t('inheritingHeroImage')}</p>}
                </div>
              )}
            </Field>
            <CheckboxRow
              size="sm"
              label={t('showBackToEvent')}
              checked={header.show_back !== false}
              onCheckedChange={(v) => patch('header', { show_back: v })}
            />
            <p className={styles.panelNote}>{t('showBackToEventHelp')}</p>
            <CheckboxRow
              size="sm"
              label={t('showLanguagePicker')}
              checked={header.show_language !== false}
              onCheckedChange={(v) => patch('header', { show_language: v })}
            />
            <p className={styles.panelNote}>{t('showLanguagePickerHelp')}</p>
          </>
        )}

        {zone === 'intro' && (
          <>
            <CheckboxRow
              size="sm"
              label={t('showIntro')}
              checked={intro.enabled === true}
              onCheckedChange={(v) => patch('intro', { enabled: v })}
            />
            <Field label={t('introText')} help={t('introTextHelp')}>
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={4}
                  value={lt(intro.text, editLocale, defaultLocale) ?? ''}
                  onChange={(e) =>
                    patch('intro', {
                      // defaultLocale as the source, so editing the original
                      // keeps its translation stamps and editing a translation
                      // clears its own — the same bookkeeping question labels
                      // use, which is what stops the next auto-translate run
                      // overwriting text a human just typed.
                      text: setLocalizedText(
                        intro.text,
                        editLocale,
                        e.target.value,
                        defaultLocale
                      ),
                    })
                  }
                />
              )}
            </Field>
          </>
        )}

        {zone === 'questions' && (
          <QuestionsZone
            t={t}
            tq={tq}
            appearance={appearance}
            onChange={onChange}
            questions={questions}
            selectedQuestionId={selectedQuestionId}
            onSelectQuestion={onSelectQuestion}
            editLocale={editLocale}
            defaultLocale={defaultLocale}
          />
        )}

        {zone === 'nav' && (
          <Field label={t('progressIndicator')} help={t('progressIndicatorHelp')}>
            {({ id }) => (
              <NativeSelect
                id={id}
                value={nav.progress ?? 'count'}
                onChange={(e) => patch('nav', { progress: e.target.value })}
              >
                {APPEARANCE_OPTIONS.progress.map((o) => (
                  <option key={o} value={o}>
                    {t(`formProgress_${o}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        )}
      </div>
    </aside>
  )
}

/**
 * Defaults → per type → per question, in that order, because that is the order
 * the resolver reads them and an organizer should be able to see why a label
 * looks the way it does by walking down the panel.
 */
function QuestionsZone({
  t,
  tq,
  appearance,
  onChange,
  questions,
  selectedQuestionId,
  onSelectQuestion,
  editLocale,
  defaultLocale,
}) {
  const q = appearance?.questions ?? {}
  const selected = questions.find((x) => x.id === selectedQuestionId)

  // Scope is a place in the resolution chain, not a place in the object: the
  // panel writes to whichever level the organizer is looking at and the
  // resolver merges them, so a type rule keeps applying to the questions a
  // per-question override does not name.
  const write = (level, key, values) => {
    const next = { ...q }
    if (level === 'defaults') {
      next.defaults = { ...(q.defaults ?? {}), ...values }
    } else if (level === 'byType') {
      next.byType = { ...(q.byType ?? {}), [key]: { ...(q.byType?.[key] ?? {}), ...values } }
    } else {
      next.byId = { ...(q.byId ?? {}), [key]: { ...(q.byId?.[key] ?? {}), ...values } }
    }
    onChange({ ...appearance, questions: next })
  }

  const clearOwn = () => {
    const byId = { ...(q.byId ?? {}) }
    delete byId[selectedQuestionId]
    onChange({ ...appearance, questions: { ...q, byId } })
  }

  // The types actually on this form, not all fourteen — offering a rule for a
  // type the form does not use is a control that can never be seen to work.
  const usedTypes = [...new Set(questions.map((x) => x.type))]

  return (
    <>
      <h3 className={styles.panelGroupHead}>{t('allQuestions')}</h3>
      <StyleControls
        t={t}
        style={q.defaults ?? {}}
        onChange={(values) => write('defaults', null, values)}
      />

      <h3 className={styles.panelGroupHead}>{t('byQuestionType')}</h3>
      <p className={styles.panelNote}>{t('byQuestionTypeHelp')}</p>
      {usedTypes.map((type) => (
        <details key={type} className={styles.panelDetails}>
          <summary>
            {tq(type)}
            {Object.keys(q.byType?.[type] ?? {}).length > 0 && (
              <span className={styles.panelDot} aria-hidden="true" />
            )}
          </summary>
          <StyleControls
            t={t}
            style={q.byType?.[type] ?? {}}
            onChange={(values) => write('byType', type, values)}
          />
        </details>
      ))}

      <h3 className={styles.panelGroupHead}>{t('oneQuestion')}</h3>
      <Field label={t('chooseQuestion')} help={t('chooseQuestionHelp')}>
        {({ id }) => (
          <NativeSelect
            id={id}
            value={selectedQuestionId ?? ''}
            onChange={(e) => onSelectQuestion(e.target.value || null)}
          >
            <option value="">{t('formNoQuestion')}</option>
            {questions.map((x) => (
              <option key={x.id} value={x.id}>
                {lt(x.label, editLocale, defaultLocale) || tq(x.type)}
                {hasOwnStyle(appearance, x.id) ? ' •' : ''}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      {selected && (
        <>
          <StyleControls
            t={t}
            style={q.byId?.[selected.id] ?? {}}
            onChange={(values) => write('byId', selected.id, values)}
          />
          {hasOwnStyle(appearance, selected.id) && (
            <Button variant="ghost" size="sm" onClick={clearOwn}>
              {t('formClearOverride')}
            </Button>
          )}
        </>
      )}
    </>
  )
}

/** The same four controls at every level of the chain, so the levels compare. */
function StyleControls({ t, style, onChange }) {
  return (
    <div className={styles.panelGroup}>
      <ColorField
        label={t('labelColor')}
        value={style.label_color}
        fallback="#20242b"
        clearLabel={t('formInherit')}
        onChange={(v) => onChange({ label_color: v })}
      />
      <Field label={t('labelSize')}>
        {({ id }) => (
          <NativeSelect
            id={id}
            value={style.label_size ?? ''}
            onChange={(e) => onChange({ label_size: e.target.value || undefined })}
          >
            <option value="">{t('formInherit')}</option>
            {Object.keys(LABEL_SIZES).map((k) => (
              <option key={k} value={k}>
                {t(`size_${k}`)}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <ColorField
        label={t('helpColor')}
        value={style.help_color}
        fallback="#4d5560"
        clearLabel={t('formInherit')}
        onChange={(v) => onChange({ help_color: v })}
      />
      <ColorField
        label={t('sectionHeadingColor')}
        value={style.section_color}
        fallback="#0e5044"
        clearLabel={t('formInherit')}
        onChange={(v) => onChange({ section_color: v })}
      />
    </div>
  )
}

/**
 * A colour with an explicit way back to unset.
 *
 * `<input type="color">` has no empty state — it always reports a colour — so
 * without the clear button an organizer who opened the picker once could never
 * return the form to inheriting the event page's theme, only to a hex code that
 * happens to match today.
 */
function ColorField({ label, value, fallback, clearLabel, onChange }) {
  const [pending, setPending] = useState(value ?? fallback)
  useEffect(() => {
    setPending(value ?? fallback)
  }, [value, fallback])

  return (
    <div className={styles.panelColorRow}>
      <span className="field-label">{label}</span>
      <div className={styles.panelColorControls}>
        <input
          type="color"
          className={styles.panelColorInput}
          value={pending}
          aria-label={label}
          onChange={(e) => {
            setPending(e.target.value)
            onChange(e.target.value)
          }}
        />
        {value != null && value !== '' && (
          <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            {clearLabel}
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

function ScaleField({ label, t, options, optionKey, value, onChange }) {
  return (
    <Field label={label}>
      {({ id }) => (
        <NativeSelect
          id={id}
          value={value ?? 'normal'}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {t(`${optionKey}${o[0].toUpperCase()}${o.slice(1)}`)}
            </option>
          ))}
        </NativeSelect>
      )}
    </Field>
  )
}
